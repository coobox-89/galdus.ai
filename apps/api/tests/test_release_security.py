"""Regression tests for the fixes of the production-readiness security review (docs/security/review-2026-11-27.md).

Each test names the finding it covers. Database tests need TEST_DATABASE_URL (see test_integration.py).
"""
import json
import logging
import time
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import accounts, connectors, mailer
from app.auth import create_mfa_token
from app.config import settings
from app.knowledge import extract_text
from app.main import app
from tests.test_integration import DB_URL, PASSWORD, client, register  # noqa: F401
from tests.test_v05 import fake_oauth, state_for

db = pytest.mark.skipif(not DB_URL, reason="TEST_DATABASE_URL not set")


@pytest.fixture(autouse=True)
def _cfg(monkeypatch):
    monkeypatch.setattr(settings, "encryption_key", "unit-test-encryption-key-with-32-chars!!")
    for p in ("google", "github", "microsoft"):
        monkeypatch.setattr(settings, f"{p}_client_id", f"{p}-id")
        monkeypatch.setattr(settings, f"{p}_client_secret", f"{p}-secret")
    monkeypatch.setattr(settings, "public_api_url", "https://api.example.com")
    monkeypatch.setattr(settings, "frontend_url", "https://app.example.com/galdus")


@pytest.fixture()
def outbox(monkeypatch):
    """Capture emails instead of sending them, with email 'configured'."""
    sent = []

    async def fake_send(to, subject, title, body, button, url, note=""):
        sent.append({"to": to, "subject": subject, "url": url})
        return True
    monkeypatch.setattr(accounts, "send", fake_send)
    monkeypatch.setattr(accounts, "email_enabled", lambda: True)
    monkeypatch.setattr(mailer, "email_enabled", lambda: True)
    return sent


def _email():
    return f"r-{uuid.uuid4().hex[:10]}@example.com"


# ---- F1. Per-account lockout on password sign-in -----------------------------------------

@db
def test_login_locks_the_account_after_repeated_failures(client, monkeypatch):
    monkeypatch.setattr(settings, "login_max_failures", 3)
    monkeypatch.setattr(settings, "rate_limit_auth_per_minute", 100)  # isolate the per-account rule from the per-IP one
    email, _ = register(client)
    for _ in range(3):
        assert client.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password-xx"}).status_code == 401
    locked = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert locked.status_code == 429 and "Retry-After" in locked.headers
    # Another account is not affected.
    other, _ = register(client)
    assert client.post("/api/v1/auth/login", json={"email": other, "password": PASSWORD}).status_code == 200


@db
def test_lockout_does_not_reveal_whether_an_account_exists(client, monkeypatch):
    monkeypatch.setattr(settings, "login_max_failures", 2)
    monkeypatch.setattr(settings, "rate_limit_auth_per_minute", 100)
    ghost = _email()
    codes = [client.post("/api/v1/auth/login", json={"email": ghost, "password": "whatever-123"}).status_code for _ in range(3)]
    assert codes == [401, 401, 429]


# ---- F2. Second factor: failures are capped per account ------------------------------------

@db
def test_mfa_codes_are_locked_after_repeated_failures(client, monkeypatch):
    monkeypatch.setattr(settings, "mfa_max_failures", 3)
    from app import mfa
    _, h = register(client)
    setup = client.post("/api/v1/auth/mfa/setup", headers=h).json()
    client.post("/api/v1/auth/mfa/enable", headers=h, json={"code": mfa.totp_now(setup["secret"])})
    me = client.get("/api/v1/auth/me", headers=h).json()
    token = create_mfa_token(me["id"])
    codes = [client.post("/api/v1/auth/mfa/verify", json={"mfa_token": token, "code": "000000"}).status_code for _ in range(4)]
    assert codes == [401, 401, 401, 429]
    # Even the right code waits for the window to end.
    right = client.post("/api/v1/auth/mfa/verify", json={"mfa_token": token, "code": mfa.totp_now(setup["secret"])})
    assert right.status_code == 429


# ---- F3. Registration does not reveal registered addresses when verification is required ---

@db
def test_registration_answers_the_same_for_new_and_existing_addresses(client, monkeypatch, outbox):
    monkeypatch.setattr(settings, "require_email_verification", True)
    email = _email()
    body = {"email": email, "password": PASSWORD, "full_name": "New Person", "organization_name": "Acme"}
    first = client.post("/api/v1/auth/register", json=body)
    second = client.post("/api/v1/auth/register", json={**body, "full_name": "Somebody Else"})
    assert first.status_code == second.status_code == 202
    assert first.json() == second.json() == {"verification_required": True, "email": email}
    assert "access_token" not in first.text
    # The real owner gets a verification link first, then a private "you already have an account" notice.
    assert [m["subject"] for m in outbox] == ["Confirm your email for Galdus.ai", "Your Galdus.ai account"]
    assert all(m["to"] == email for m in outbox)


@db
def test_registration_without_email_still_reports_conflicts(client):
    email, _ = register(client)
    r = client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD, "full_name": "X", "organization_name": "Acme"})
    assert r.status_code == 409


# ---- F4. ADMIN_EMAILS needs a proven address in production --------------------------------

@db
def test_listed_admin_email_is_not_trusted_before_verification_in_production(client, monkeypatch, outbox):
    admin = _email()
    monkeypatch.setattr(settings, "admin_emails", admin)
    monkeypatch.setattr(settings, "environment", "production")
    r = client.post("/api/v1/auth/register", json={"email": admin, "password": PASSWORD, "full_name": "Squatter", "organization_name": "Evil"})
    assert r.status_code == 201
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=h).json()["is_platform_admin"] is False
    assert client.get("/api/v1/admin/overview", headers=h).status_code == 403
    # Opening the link sent to that mailbox proves it: now the console opens.
    token = outbox[0]["url"].split("token=")[1]
    assert client.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 200
    assert client.get("/api/v1/auth/me", headers=h).json()["is_platform_admin"] is True


# ---- F5. Microsoft sign-in cannot take over accounts by email ---------------------------------

@db
def test_microsoft_sign_in_creates_unverified_account_and_never_links_by_email(client, monkeypatch, outbox):
    existing, _ = register(client)
    fake_oauth(monkeypatch, {"subject": f"ms-{uuid.uuid4().hex}", "email": existing, "name": "Tenant Admin", "verified": False})
    r = client.get("/api/v1/auth/oauth/microsoft/callback", params={"code": "c", "state": state_for("microsoft", client=client)},
                   follow_redirects=False)
    assert "error=" in r.headers["location"] and "token=" not in r.headers["location"]

    fresh = _email()
    fake_oauth(monkeypatch, {"subject": f"ms-{uuid.uuid4().hex}", "email": fresh, "name": "Mia Rossi", "verified": False})
    r = client.get("/api/v1/auth/oauth/microsoft/callback", params={"code": "c", "state": state_for("microsoft", client=client)},
                   follow_redirects=False)
    assert "token=" in r.headers["location"]
    token = r.headers["location"].split("token=")[1].split("&")[0]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["email"] == fresh and me["email_verified"] is False
    assert any(m["subject"] == "Confirm your email for Galdus.ai" for m in outbox)


@db
def test_password_reset_drops_sign_ins_linked_before_the_address_was_proven(client, monkeypatch, outbox):
    victim = _email()
    sub = f"ms-{uuid.uuid4().hex}"
    fake_oauth(monkeypatch, {"subject": sub, "email": victim, "name": "Squatter", "verified": False})
    client.get("/api/v1/auth/oauth/microsoft/callback", params={"code": "c", "state": state_for("microsoft", client=client)},
               follow_redirects=False)
    outbox.clear()
    # The real owner of the mailbox resets the password...
    assert client.post("/api/v1/auth/password/forgot", json={"email": victim}).status_code == 202
    token = outbox[0]["url"].split("token=")[1]
    assert client.post("/api/v1/auth/password/reset", json={"token": token, "password": "owner-new-password-1"}).status_code == 200
    # ...and the squatter's Microsoft sign-in no longer opens the account (it starts a new one, which is refused by email).
    r = client.get("/api/v1/auth/oauth/microsoft/callback", params={"code": "c", "state": state_for("microsoft", client=client)},
                   follow_redirects=False)
    assert "token=" not in r.headers["location"]


@db
def test_password_reset_invalidates_other_reset_links(client, outbox):
    email, _ = register(client)
    outbox.clear()
    client.post("/api/v1/auth/password/forgot", json={"email": email})
    client.post("/api/v1/auth/password/forgot", json={"email": email})
    first, second = (m["url"].split("token=")[1] for m in outbox)
    assert client.post("/api/v1/auth/password/reset", json={"token": second, "password": "brand-new-password-2"}).status_code == 200
    assert client.post("/api/v1/auth/password/reset", json={"token": first, "password": "brand-new-password-3"}).status_code == 400


@db
def test_forgot_password_emails_are_capped_per_address(client, outbox):
    email, _ = register(client)
    outbox.clear()
    codes = [client.post("/api/v1/auth/password/forgot", json={"email": email}).status_code for _ in range(5)]
    assert codes == [202] * 5  # the answer never changes...
    assert len(outbox) == 3    # ...but the mailbox gets at most three links an hour


# ---- F6. Cloud-drive consent cannot be attached to someone else's workspace -----------------

@db
def test_connector_completion_is_bound_to_the_person_who_started_it(client, monkeypatch):
    fake_oauth(monkeypatch, {})

    async def account_email(kind, token):
        return "victim-drive@example.com"
    monkeypatch.setattr(connectors, "_account_email", account_email)
    _, attacker = register(client)
    me = client.get("/api/v1/auth/me", headers=attacker).json()
    org = client.get("/api/v1/auth/organizations", headers=attacker).json()[0]["id"]
    state = state_for("google", "connect", k="google_drive", o=org, u=me["id"])
    _, victim = register(client)
    r = client.post("/api/v1/connectors/google/complete", headers=victim, json={"code": "victim-code", "state": state})
    assert r.status_code == 403
    assert client.get("/api/v1/connectors", headers=attacker).json()["connections"] == []


# ---- F7. Webhook input is validated and capped per automation -------------------------------

@db
def test_webhook_rejects_malformed_bodies_without_a_server_error(client, monkeypatch):
    from app import automation

    async def fake_run(db, a, trigger, user_input=None):
        return type("R", (), {"id": uuid.uuid4(), "status": "succeeded", "output": "ok", "error": None})()
    monkeypatch.setattr(automation, "run_automation", fake_run)
    monkeypatch.setattr(settings, "allow_private_model_endpoints", True)
    _, h = register(client)
    conn = client.post("/api/v1/models/connections", headers=h, json={"provider": "openai_compatible", "label": "L",
                                                                       "api_base": "http://127.0.0.1:9/v1", "default_model": "m"})
    assert conn.status_code == 201, conn.text
    agent = client.post("/api/v1/agents", headers=h, json={"name": "A", "instructions": "x", "model": "m",
                                                           "connection_id": conn.json()["id"]}).json()
    hook = client.post("/api/v1/automations", headers=h, json={"name": "H", "agent_id": agent["id"], "input": "x", "webhook": True}).json()
    path = hook["webhook_path"]
    assert client.post(path, content=b"{not json", headers={"Content-Type": "application/json"}).status_code == 400
    assert client.post(path, json={"input": 123}).status_code == 422
    assert client.post(path, json={"input": "x" * 20_001}).status_code == 422
    # 10 calls a minute per automation, malformed ones included (the three above).
    codes = [client.post(path, json={"input": "hi"}).status_code for _ in range(8)]
    assert codes == [200] * 7 + [429]


# ---- F8. Account deletion works for every account and never orphans a team ------------------

@db
def test_oauth_only_accounts_can_delete_themselves(client, monkeypatch):
    email = _email()
    fake_oauth(monkeypatch, {"subject": f"gh-{uuid.uuid4().hex}", "email": email, "name": "Octo", "verified": True})
    r = client.get("/api/v1/auth/oauth/github/callback", params={"code": "c", "state": state_for("github", client=client)},
                   follow_redirects=False)
    h = {"Authorization": f"Bearer {r.headers['location'].split('token=')[1].split('&')[0]}"}
    assert client.post("/api/v1/auth/account/delete", headers=h, json={"confirm_email": "wrong@example.com"}).status_code == 400
    assert client.post("/api/v1/auth/account/delete", headers=h, json={"confirm_email": email.upper()}).status_code == 204
    assert client.get("/api/v1/auth/me", headers=h).status_code == 401


@db
def test_sole_owner_of_a_shared_workspace_must_hand_over_first(client):
    _, owner = register(client, org="Shared Team")
    member_email, member = register(client)
    org = client.get("/api/v1/auth/organizations", headers=owner).json()[0]["id"]
    invite = client.post("/api/v1/org/invitations", headers={**owner, "X-Organization-Id": org}, json={"email": member_email}).json()
    client.post("/api/v1/invitations/accept", headers=member, json={"token": invite["token"]})
    r = client.post("/api/v1/auth/account/delete", headers=owner, json={"password": PASSWORD})
    assert r.status_code == 409 and "Shared Team" in r.json()["detail"]
    # The member can still leave by deleting their own account; their personal workspace goes with them.
    assert client.post("/api/v1/auth/account/delete", headers=member, json={"password": PASSWORD}).status_code == 204


# ---- F9. The export contains the person's conversations and sign-ins --------------------------

@db
def test_export_includes_conversations_and_runs(client):
    _, h = register(client)
    conv = client.post("/api/v1/conversations", headers=h, json={"title": "Budget 2027"}).json()
    data = client.get("/api/v1/auth/export", headers=h).json()
    assert data["format"] == "galdus-account-export/2"
    assert [c["title"] for c in data["conversations"]] == ["Budget 2027"] and conv["id"] == data["conversations"][0]["id"]
    assert {"runs", "linked_sign_ins", "usage_events", "organizations"} <= data.keys()
    assert "password" not in json.dumps(data).replace("has_password", "")


# ---- F10. Row level security stays on for every table ------------------------------------------

@db
def test_every_table_has_row_level_security(client):
    from tests.test_integration import create_async_engine, NullPool  # same driver as the app

    async def check():
        engine = create_async_engine(DB_URL, poolclass=NullPool)
        async with engine.connect() as c:
            rows = (await c.execute(text(
                "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                "where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity"))).scalars().all()
        await engine.dispose()
        return rows
    import asyncio
    assert asyncio.run(check()) == [], "tables without RLS: add ENABLE ROW LEVEL SECURITY in the migration"


@db
def test_readiness_reports_migrations_against_the_real_database(client):
    body = client.get("/readyz").json()
    assert body["status"] == "ready" and body["migrations"] == "ok"


# ---- F11. Headers, uniform errors and logs ------------------------------------------------------

def test_api_responses_carry_security_headers_and_request_id():
    r = TestClient(app).get("/health")
    assert r.headers["content-security-policy"].startswith("default-src 'none'")
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert len(r.headers["x-request-id"]) >= 8
    assert r.json()["version"]


def test_errors_share_one_shape_and_do_not_echo_values():
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"email": "not-an-email", "password": "super-secret-value"})
    assert r.status_code == 422 and r.json()["request_id"] == r.headers["x-request-id"]
    assert "super-secret-value" not in r.text and "not-an-email" not in r.text
    missing = c.get("/api/v1/does-not-exist")
    assert missing.status_code == 404 and set(missing.json()) == {"detail", "request_id"}


def test_unhandled_errors_are_generic(monkeypatch):
    from app import main

    @main.app.get("/__boom_for_test")
    async def boom():
        raise RuntimeError("database password is hunter2")
    try:
        r = TestClient(main.app, raise_server_exceptions=False).get("/__boom_for_test")
    finally:
        main.app.router.routes[:] = [rt for rt in main.app.router.routes if getattr(rt, "path", "") != "/__boom_for_test"]
    assert r.status_code == 500 and "hunter2" not in r.text and r.json()["request_id"]


def test_request_logs_use_the_route_template_not_secrets(caplog):
    caplog.set_level(logging.INFO, logger="galdus.http")
    TestClient(app).post("/api/v1/hooks/secret-webhook-token-abcdefghijkl", json={})
    lines = [getattr(r, "fields", {}) for r in caplog.records if r.name == "galdus.http"]
    assert lines and lines[-1]["route"] == "/api/v1/hooks/{token}"
    assert "secret-webhook-token" not in caplog.text


def test_cors_only_allows_configured_origins():
    c = TestClient(app)
    allowed = settings.cors_origin_list[0]
    ok = c.options("/api/v1/auth/login", headers={"Origin": allowed, "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == allowed
    bad = c.options("/api/v1/auth/login", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in bad.headers


def test_json_log_lines_are_valid_json():
    from app.logs import JsonFormatter
    record = logging.LogRecord("galdus.test", logging.INFO, __file__, 1, "hello %s", ("world",), None)
    record.fields = {"route": "/x"}
    assert json.loads(JsonFormatter().format(record)) | {"ts": None} == {"ts": None, "level": "info", "logger": "galdus.test",
                                                                         "msg": "hello world", "route": "/x"}


# ---- F12. Upload type checks -------------------------------------------------------------------

def test_uploads_must_match_their_extension():
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        extract_text("report.pdf", b"MZ\x90\x00 this is an executable")
    with pytest.raises(HTTPException):
        extract_text("notes.txt", b"\x7fELF\x02\x01\x01\x00\x00\x00")
    assert extract_text("notes.md", "# Ciao".encode())[0] == "# Ciao"


# ---- F13. Client IP header (rate limits behind a proxy) ----------------------------------------

def test_client_ip_header_is_used_only_when_configured(monkeypatch):
    from starlette.requests import Request
    from app.ratelimit import client_ip
    scope = {"type": "http", "headers": [(b"cf-connecting-ip", b"203.0.113.7")], "client": ("10.0.0.1", 1234)}
    assert client_ip(Request(scope)) == "10.0.0.1"
    monkeypatch.setattr(settings, "client_ip_header", "cf-connecting-ip")
    assert client_ip(Request(scope)) == "203.0.113.7"


# ---- Phase 4. First-run tour state lives on the account ----------------------------------------

@db
def test_onboarding_state_is_saved_on_the_account(client):
    _, h = register(client)
    assert client.get("/api/v1/auth/me", headers=h).json()["onboarding"] == "pending"
    assert client.put("/api/v1/auth/onboarding", headers=h, json={"status": "skipped"}).json()["status"] == "skipped"
    assert client.get("/api/v1/auth/me", headers=h).json()["onboarding"] == "skipped"
    done = client.put("/api/v1/auth/onboarding", headers=h, json={"status": "completed"}).json()
    assert done["status"] == "completed" and done["completed_at"]
    assert client.put("/api/v1/auth/onboarding", headers=h, json={"status": "pending"}).json() == {"status": "pending", "completed_at": None}
    assert client.put("/api/v1/auth/onboarding", headers=h, json={"status": "whatever"}).status_code == 422
    assert client.get("/api/v1/auth/onboarding").status_code == 401


def test_version_is_consistent():
    from app.version import VERSION
    from packaging.version import Version
    import tomllib
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    assert Version(tomllib.loads((root / "pyproject.toml").read_text())["project"]["version"]) == Version(VERSION)
    web = json.loads((root.parent / "web" / "package.json").read_text())
    assert web["version"] == VERSION


@db
def test_lockout_also_holds_with_the_shared_postgres_backend(client, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_backend", "postgres")
    monkeypatch.setattr(settings, "login_max_failures", 2)
    monkeypatch.setattr(settings, "rate_limit_auth_per_minute", 100)
    import app.db as app_db
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool
    monkeypatch.setattr(app_db, "SessionLocal", async_sessionmaker(create_async_engine(DB_URL, poolclass=NullPool), expire_on_commit=False))
    email, _ = register(client)
    codes = [client.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password-xx"}).status_code for _ in range(3)]
    assert codes == [401, 401, 429]
