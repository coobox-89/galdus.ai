import json
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest

from app import accounts, chat as chat_module, connectors, oauth
from app.config import settings
from tests.test_integration import DB_URL, PASSWORD, client, register  # noqa: F401

db = pytest.mark.skipif(not DB_URL, reason="TEST_DATABASE_URL not set")


@pytest.fixture(autouse=True)
def _cfg(monkeypatch):
    monkeypatch.setattr(settings, "encryption_key", "unit-test-encryption-key-with-32-chars!!")
    for p in ("google", "github", "microsoft"):
        monkeypatch.setattr(settings, f"{p}_client_id", f"{p}-id")
        monkeypatch.setattr(settings, f"{p}_client_secret", f"{p}-secret")
    monkeypatch.setattr(settings, "public_api_url", "https://api.example.com")
    monkeypatch.setattr(settings, "frontend_url", "https://app.example.com/galdus")


def test_state_is_encrypted_and_expires(monkeypatch):
    url = oauth.authorize_url("google", "login", "openid email")
    q = parse_qs(urlparse(url).query)
    assert q["code_challenge_method"] == ["S256"] and q["redirect_uri"] == ["https://api.example.com/api/v1/auth/oauth/google/callback"]
    state = oauth.read_state(q["state"][0])
    assert state["p"] == "google" and len(state["v"]) > 40 and state["v"] not in url
    monkeypatch.setattr(oauth.time, "time", lambda: 10 ** 12)
    with pytest.raises(Exception):
        oauth.read_state(q["state"][0])
    with pytest.raises(Exception):
        oauth.read_state("garbage")


def fake_oauth(monkeypatch, ident):
    async def exchange(provider, purpose, code, state):
        return {"access_token": "at", "refresh_token": "rt", "expires_in": 3600}

    async def fetch(provider, token):
        return ident
    monkeypatch.setattr(accounts, "exchange_code", exchange)
    monkeypatch.setattr(accounts, "fetch_identity", fetch)
    monkeypatch.setattr(connectors, "exchange_code", exchange)


def state_for(provider, purpose="login", client=None, **extra):
    if purpose == "login" and client is not None:
        # The login flow is bound to the browser that started it.
        client.cookies.set(accounts.OAUTH_COOKIE, "browser-nonce", path="/api/v1/auth/oauth")
        extra = {"n": accounts._hash("browser-nonce"), **extra}
    return parse_qs(urlparse(oauth.authorize_url(provider, purpose, "x", extra_state=extra)).query)["state"][0]


@db
def test_oauth_login_creates_user_then_reuses_identity(client, monkeypatch):
    import uuid
    octo = f"octo-{uuid.uuid4().hex[:8]}@example.com"
    fake_oauth(monkeypatch, {"subject": f"gh-{uuid.uuid4().hex}", "email": octo, "name": "Octo Cat", "verified": True})
    assert client.get("/api/v1/auth/providers").json()["login"] == ["google", "github", "microsoft"]
    r = client.get("/api/v1/auth/oauth/github/callback", params={"code": "c", "state": state_for("github", client=client)}, follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"].startswith("https://app.example.com/galdus/#/oauth?token=")
    token = parse_qs(r.headers["location"].split("?", 1)[1])["token"][0]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["email"] == octo
    prefs = client.get("/api/v1/auth/preferences", headers={"Authorization": f"Bearer {token}"}).json()
    assert prefs["has_password"] is False and prefs["linked_providers"] == ["github"]
    # Same identity again: no duplicate user.
    r2 = client.get("/api/v1/auth/oauth/github/callback", params={"code": "c", "state": state_for("github", client=client)}, follow_redirects=False)
    assert "token=" in r2.headers["location"]


@db
def test_oauth_links_existing_account_only_with_verified_email(client, monkeypatch):
    email, h = register(client)
    import uuid
    sub = f"g-{uuid.uuid4().hex}"
    fake_oauth(monkeypatch, {"subject": sub, "email": email, "name": "X", "verified": False})
    r = client.get("/api/v1/auth/oauth/google/callback", params={"code": "c", "state": state_for("google", client=client)}, follow_redirects=False)
    assert "error=" in r.headers["location"]
    fake_oauth(monkeypatch, {"subject": sub, "email": email, "name": "X", "verified": True})
    r = client.get("/api/v1/auth/oauth/google/callback", params={"code": "c", "state": state_for("google", client=client)}, follow_redirects=False)
    assert "token=" in r.headers["location"]


@db
def test_oauth_rejects_state_for_other_provider(client, monkeypatch):
    fake_oauth(monkeypatch, {"subject": "1", "email": "a@example.com", "name": "a", "verified": True})
    r = client.get("/api/v1/auth/oauth/google/callback", params={"code": "c", "state": state_for("github", client=client)}, follow_redirects=False)
    assert "error=" in r.headers["location"]


@db
def test_password_reset_and_change(client, monkeypatch):
    sent = []

    async def fake_send(to, subject, title, body, button, url, note=""):
        sent.append(url)
        return True
    monkeypatch.setattr(accounts, "send", fake_send)
    monkeypatch.setattr(accounts, "email_enabled", lambda: True)
    email, h = register(client)
    sent.clear()  # the verification email sent at registration
    assert client.post("/api/v1/auth/password/forgot", json={"email": "nobody@example.com"}).status_code == 202
    assert sent == []
    assert client.post("/api/v1/auth/password/forgot", json={"email": email}).status_code == 202
    token = sent[0].split("token=")[1]
    assert client.post("/api/v1/auth/password/reset", json={"token": token, "password": "brand-new-password-1"}).status_code == 200
    assert client.post("/api/v1/auth/password/reset", json={"token": token, "password": "another-password-12"}).status_code == 400
    assert client.post("/api/v1/auth/login", json={"email": email, "password": "brand-new-password-1"}).status_code == 200
    login = client.post("/api/v1/auth/login", json={"email": email, "password": "brand-new-password-1"}).json()
    hh = {"Authorization": f"Bearer {login['access_token']}"}
    assert client.post("/api/v1/auth/password/change", headers=hh, json={"current_password": "wrong", "new_password": "x" * 12}).status_code == 400
    import time
    time.sleep(1.1)  # token iat has one-second precision
    changed = client.post("/api/v1/auth/password/change", headers=hh, json={"current_password": "brand-new-password-1", "new_password": "y" * 14})
    assert changed.status_code == 200
    # Older sessions are signed out; the token returned by the change keeps working.
    assert client.get("/api/v1/auth/me", headers=hh).status_code == 401
    fresh = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=fresh).status_code == 200
    time.sleep(1.1)
    assert client.post("/api/v1/auth/logout-all", headers=fresh).status_code == 200
    assert client.get("/api/v1/auth/me", headers=fresh).status_code == 401


@db
def test_oauth_login_requires_the_browser_that_started_it(client, monkeypatch):
    fake_oauth(monkeypatch, {"subject": "x1", "email": "csrf@example.com", "name": "a", "verified": True})
    state = state_for("github", client=client)
    client.cookies.clear()
    r = client.get("/api/v1/auth/oauth/github/callback", params={"code": "c", "state": state}, follow_redirects=False)
    assert "error=" in r.headers["location"] and "token=" not in r.headers["location"]
    start = client.get("/api/v1/auth/oauth/github/start", follow_redirects=False)
    assert start.status_code == 302 and accounts.OAUTH_COOKIE in start.headers.get("set-cookie", "")


def stream_completion(text_parts, capture):
    async def fake(**kwargs):
        capture.append(kwargs)

        async def gen():
            for t in text_parts:
                yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=t))], usage=None)
            yield SimpleNamespace(choices=[], usage=SimpleNamespace(prompt_tokens=11, completion_tokens=4))
        return gen()
    return fake


def events(resp):
    return [json.loads(line[6:]) for line in resp.text.splitlines() if line.startswith("data: ")]


@db
def test_conversation_streaming_personalisation_and_history(client, monkeypatch):
    calls = []
    monkeypatch.setattr(chat_module.litellm, "acompletion", stream_completion(["Ciao ", "Mario!"], calls))
    _, h = register(client)
    conn = client.post("/api/v1/models/connections", headers=h, json={"provider": "openrouter", "label": "OR",
                                                                       "api_key": "sk-or-v1-abcdefghijkl", "default_model": "qwen/qwen-2.5-72b-instruct"}).json()
    client.put("/api/v1/auth/preferences", headers=h, json={"full_name": "Mario Rossi", "custom_instructions": "I run an MSP in Milan.",
                                                             "response_style": "concise"})
    conv = client.post("/api/v1/conversations", headers=h, json={"persona": "it_expert", "connection_id": conn["id"]}).json()
    r = client.post(f"/api/v1/conversations/{conv['id']}/messages", headers=h, json={"content": "Hello there\nsecond line"})
    ev = events(r)
    assert [e["type"] for e in ev] == ["meta", "delta", "delta", "done"] and ev[-1]["tokens"] == 15
    system = calls[0]["messages"][0]["content"]
    assert "infrastructure" in system and "MSP in Milan" in system and "short" in system and "Mario Rossi" in system
    assert calls[0]["stream"] is True and calls[0]["api_key"] == "sk-or-v1-abcdefghijkl"

    r2 = client.post(f"/api/v1/conversations/{conv['id']}/messages", headers=h, json={"content": "And again"})
    assert events(r2)[-1]["type"] == "done"
    assert [m["role"] for m in calls[1]["messages"]] == ["system", "user", "assistant", "user"]
    full = client.get(f"/api/v1/conversations/{conv['id']}", headers=h).json()
    assert full["title"] == "Hello there" and len(full["messages"]) == 4 and full["messages"][1]["content"] == "Ciao Mario!"
    assert client.delete(f"/api/v1/conversations/{conv['id']}/messages/last", headers=h).status_code == 204
    assert len(client.get(f"/api/v1/conversations/{conv['id']}", headers=h).json()["messages"]) == 2

    _, other = register(client)
    assert client.get(f"/api/v1/conversations/{conv['id']}", headers=other).status_code == 404


@db
def test_attachments_text_and_image(client, monkeypatch):
    calls = []
    monkeypatch.setattr(chat_module.litellm, "acompletion", stream_completion(["ok"], calls))
    _, h = register(client)
    conn = client.post("/api/v1/models/connections", headers=h, json={"provider": "openai", "label": "O", "api_key": "sk-test-1234567890",
                                                                       "default_model": "gpt-4o-mini"}).json()
    t = client.post("/api/v1/chat/attachments", headers=h, files={"file": ("notes.md", b"Server X restarts at 3am", "text/markdown")}).json()
    img = client.post("/api/v1/chat/attachments", headers=h, files={"file": ("shot.png", b"\x89PNG\r\n\x1a\nfake", "image/png")}).json()
    fake = client.post("/api/v1/chat/attachments", headers=h, files={"file": ("evil.png", b"<script>alert(1)</script>", "image/png")})
    assert fake.status_code == 400
    assert t["kind"] == "text" and img["data_url"].startswith("data:image/png;base64,")
    conv = client.post("/api/v1/conversations", headers=h, json={"connection_id": conn["id"]}).json()
    client.post(f"/api/v1/conversations/{conv['id']}/messages", headers=h, json={"content": "What is in these?", "attachments": [t, img]})
    content = calls[0]["messages"][-1]["content"]
    assert content[0]["type"] == "text" and "Server X restarts" in content[0]["text"] and content[1]["type"] == "image_url"
    stored = client.get(f"/api/v1/conversations/{conv['id']}", headers=h).json()["messages"][0]
    assert stored["attachments"] == [{"name": "notes.md", "kind": "text"}, {"name": "shot.png", "kind": "image"}]


@db
def test_google_drive_connector_import_and_resync(client, monkeypatch):
    fake_oauth(monkeypatch, {})

    async def account_email(kind, token):
        return "drive@example.com"
    version = {"v": "2026-01-01", "text": "Drive policy: backups at 02:00"}

    async def download(db, c, ref):
        return "Policy.txt", version["text"], version["v"]
    monkeypatch.setattr(connectors, "_account_email", account_email)
    monkeypatch.setattr(connectors, "download", download)
    _, h = register(client)
    me = client.get("/api/v1/auth/me", headers=h).json()
    org = client.get("/api/v1/auth/organizations", headers=h).json()[0]["id"]
    assert client.post("/api/v1/connectors/google_drive/authorize", headers=h).json()["url"].startswith("https://accounts.google.com/")
    state = state_for("google", "connect", k="google_drive", o=org, u=me["id"])
    r = client.get("/api/v1/connectors/google/callback", params={"code": "c", "state": state}, follow_redirects=False)
    # The callback only hands the code to the console; the signed-in session finishes the connection.
    assert r.status_code == 302 and "#/integrations?connect_provider=google&code=c&state=" in r.headers["location"]
    assert client.get("/api/v1/connectors", headers=h).json()["connections"] == []
    done = client.post("/api/v1/connectors/google/complete", headers=h, json={"code": "c", "state": state})
    assert done.status_code == 201, done.text
    listing = client.get("/api/v1/connectors", headers=h).json()
    cid = listing["connections"][0]["id"]
    assert listing["connections"][0]["account_email"] == "drive@example.com"
    col = client.post("/api/v1/knowledge/collections", headers=h, json={"name": "Drive"}).json()
    imp = client.post(f"/api/v1/connectors/{cid}/import", headers=h, json={"collection_id": col["id"], "refs": ["file-1"]}).json()
    assert imp["results"][0]["ok"]
    docs = client.get(f"/api/v1/knowledge/collections/{col['id']}/documents", headers=h).json()
    version.update(v="2026-02-01", text="Drive policy: backups at 04:00")
    assert client.post(f"/api/v1/connectors/documents/{docs[0]['id']}/resync", headers=h).json()["updated"] is True
    hits = client.post(f"/api/v1/knowledge/collections/{col['id']}/search", headers=h, json={"query": "backups"}).json()
    assert len(hits) == 1 and "04:00" in hits[0]["content"]
    _, other = register(client)
    assert client.get(f"/api/v1/connectors/{cid}/files", headers=other).status_code == 404


@db
def test_members_cannot_change_knowledge_or_browse_drives(client):
    owner_email, owner = register(client)
    col = client.post("/api/v1/knowledge/collections", headers=owner, json={"name": "Runbooks"}).json()
    member_email, member = register(client)
    org = client.get("/api/v1/auth/organizations", headers=owner).json()[0]["id"]
    link = client.post("/api/v1/org/invitations", headers={**owner, "X-Organization-Id": org}, json={"email": member_email, "role": "member"}).json()
    client.post("/api/v1/invitations/accept", headers=member, json={"token": link["token"]})
    m = {**member, "X-Organization-Id": org}
    assert client.post(f"/api/v1/knowledge/collections/{col['id']}/documents/text", headers=m, json={"title": "x", "content": "y"}).status_code == 403
    doc = client.post(f"/api/v1/knowledge/collections/{col['id']}/documents/text", headers={**owner, "X-Organization-Id": org}, json={"title": "x", "content": "y"}).json()
    assert client.delete(f"/api/v1/knowledge/documents/{doc['id']}", headers=m).status_code == 403
    import uuid
    assert client.get(f"/api/v1/connectors/{uuid.uuid4()}/files", headers=m).status_code == 403
