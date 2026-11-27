import base64
import time

import pytest

from app import accounts, mailer, mfa
from app.config import settings
from tests.test_integration import DB_URL, PASSWORD, client, register  # noqa: F401

db = pytest.mark.skipif(not DB_URL, reason="TEST_DATABASE_URL not set")


@pytest.fixture(autouse=True)
def _cfg(monkeypatch):
    monkeypatch.setattr(settings, "encryption_key", "unit-test-encryption-key-with-32-chars!!")
    monkeypatch.setattr(settings, "frontend_url", "https://app.example.com")


def test_totp_matches_rfc6238_vector():
    # RFC 6238 appendix B, SHA1, secret "12345678901234567890", T=59 -> 94287082 (8 digits); 6 digits -> 287082
    secret = base64.b32encode(b"12345678901234567890").decode().rstrip("=")
    assert mfa.totp_now(secret, at=59) == "287082"
    assert mfa.match_step(secret, "287082", None, at=59) == 1
    assert mfa.match_step(secret, "287082", 1, at=59) is None  # no replay
    assert mfa.match_step(secret, "000000", None, at=59) is None


def test_email_template_escapes_and_brands():
    html = mailer._html("Hi <b>", "Body & more", "Go", "https://x.example/?a=1&b=2")
    assert "Hi &lt;b&gt;" in html and "Body &amp; more" in html and "#B6FF00" in html and "a=1&amp;b=2" in html


@db
def test_mfa_full_flow(client):
    email, h = register(client)
    assert client.get("/api/v1/auth/me", headers=h).json()["mfa_enabled"] is False
    setup = client.post("/api/v1/auth/mfa/setup", headers=h).json()
    assert setup["otpauth_uri"].startswith("otpauth://totp/") and "<svg" in setup["qr_svg"]
    assert client.post("/api/v1/auth/mfa/enable", headers=h, json={"code": "000000"}).status_code == 400
    on = client.post("/api/v1/auth/mfa/enable", headers=h, json={"code": mfa.totp_now(setup["secret"])}).json()
    assert on["enabled"] and len(on["recovery_codes"]) == 10

    login = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}).json()
    assert login["mfa_required"] and "access_token" not in login
    # The MFA token is not a session.
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {login['mfa_token']}"}).status_code == 401
    assert client.post("/api/v1/auth/mfa/verify", json={"mfa_token": login["mfa_token"], "code": "123456"}).status_code == 401
    # A recovery code works once.
    code = on["recovery_codes"][0]
    ok = client.post("/api/v1/auth/mfa/verify", json={"mfa_token": login["mfa_token"], "code": code})
    assert ok.status_code == 200 and ok.json()["access_token"]
    again = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}).json()
    assert client.post("/api/v1/auth/mfa/verify", json={"mfa_token": again["mfa_token"], "code": code}).status_code == 401
    hh = {"Authorization": f"Bearer {ok.json()['access_token']}"}
    assert client.get("/api/v1/auth/mfa/status", headers=hh).json()["recovery_codes_left"] == 9
    assert client.post("/api/v1/auth/mfa/disable", headers=hh, json={"code": on["recovery_codes"][1], "password": "wrong-password-123"}).status_code == 400
    off = client.post("/api/v1/auth/mfa/disable", headers=hh, json={"code": on["recovery_codes"][1], "password": PASSWORD})
    assert off.json()["enabled"] is False
    assert "access_token" in client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}).json()


@db
def test_email_verification(client, monkeypatch):
    sent = []

    async def fake_send(to, subject, title, body, button, url, note=""):
        sent.append(url)
        return True
    monkeypatch.setattr(accounts, "send", fake_send)
    monkeypatch.setattr(accounts, "email_enabled", lambda: True)
    monkeypatch.setattr(mailer, "email_enabled", lambda: True)
    email, h = register(client)
    assert sent and "#/verify?token=" in sent[-1]
    me = client.get("/api/v1/auth/me", headers=h).json()
    assert me["email_verified"] is False and me["email_verification_pending"] is True
    monkeypatch.setattr(settings, "require_email_verification", True)
    assert client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}).status_code == 403
    token = sent[-1].split("token=")[1]
    assert client.post("/api/v1/auth/verify-email", json={"token": "x" * 30}).status_code == 400
    assert client.post("/api/v1/auth/verify-email", json={"token": token}).json()["ok"]
    assert client.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 400  # single use
    assert client.get("/api/v1/auth/me", headers=h).json()["email_verified"] is True
    assert client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}).status_code == 200


@db
def test_profile_and_avatar(client):
    _, h = register(client)
    assert client.put("/api/v1/auth/me/profile", headers=h, json={"full_name": "  Ada Lovelace "}).json()["full_name"] == "Ada Lovelace"
    png = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 100).decode()
    assert client.put("/api/v1/auth/me/avatar", headers=h, json={"image": png}).status_code == 200
    assert client.get("/api/v1/auth/me", headers=h).json()["avatar"] == png
    fake = "data:image/png;base64," + base64.b64encode(b"<svg onload=alert(1)>" + b"0" * 40).decode()
    assert client.put("/api/v1/auth/me/avatar", headers=h, json={"image": fake}).status_code == 400
    svg = "data:image/svg+xml;base64," + base64.b64encode(b"<svg></svg>" + b"0" * 40).decode()
    assert client.put("/api/v1/auth/me/avatar", headers=h, json={"image": svg}).status_code == 400
    assert client.delete("/api/v1/auth/me/avatar", headers=h).json()["avatar"] is None


@db
def test_shared_rate_limit(client, monkeypatch):
    from sqlalchemy import text  # noqa: F401
    monkeypatch.setattr(settings, "rate_limit_backend", "postgres")
    # A NullPool session per call: the app's pooled engine is bound to another event loop in tests,
    # and the shared limiter fails open (allows) when the database errors.
    import app.db as app_db
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool
    from tests.test_integration import DB_URL as url
    monkeypatch.setattr(app_db, "SessionLocal", async_sessionmaker(create_async_engine(url, poolclass=NullPool), expire_on_commit=False))
    import time
    from datetime import datetime
    if datetime.now().second > 50:  # fixed one-minute windows: do not straddle a boundary
        time.sleep(61 - datetime.now().second)
    codes = [client.post("/api/v1/auth/mfa/verify", json={"mfa_token": "x" * 20, "code": "123456"},
                         headers={"X-Forwarded-For": "203.0.113.9"}).status_code for _ in range(12)]
    assert 429 in codes and codes.count(401) <= 10


def test_qr_code_scales_to_its_box_with_a_full_quiet_zone():
    # Regression: the SVG had a fixed 318 px size and no viewBox, so the 200 px box cropped it and
    # authenticator apps could not read it.
    svg = mfa.qr_svg(mfa.otpauth_uri("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", "someone@example.com"))
    head = svg.split(">", 1)[0]
    assert 'viewBox="0 0 ' in head and "width=" not in head and "height=" not in head
    side = int(head.split('viewBox="0 0 ')[1].split(" ")[0])
    modules = side // 10
    assert svg.count('d="M0 0h') == 1 and f"h{modules}v{modules}" in svg  # one background, the whole symbol plus border
