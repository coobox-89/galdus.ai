"""HTTP-level tests against a real, migrated PostgreSQL database.

Run with TEST_DATABASE_URL=postgresql+asyncpg://... after `alembic upgrade head`.
Skipped when the variable is not set.
"""
import os
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app import chat as chat_module
from app.config import settings
from app.db import get_db
from app.main import app

DB_URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DB_URL, reason="TEST_DATABASE_URL not set")

PASSWORD = "a-very-long-test-password"


@pytest.fixture()
def client(monkeypatch):
    engine = create_async_engine(DB_URL, poolclass=NullPool)
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(settings, "litellm_model", "openai/gpt-4o-mini")
    monkeypatch.setattr(settings, "allowed_models", "openai/gpt-4o-mini")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test-not-real")
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


def register(client, email=None, org="Acme"):
    email = email or f"user-{uuid.uuid4().hex[:10]}@example.com"
    r = client.post("/api/v1/auth/register", json={
        "email": email, "password": PASSWORD, "full_name": "Test User", "organization_name": org,
    })
    assert r.status_code == 201, r.text
    data = r.json()
    return email, {"Authorization": f"Bearer {data['access_token']}"}


def fake_completion(content="Hello from the model", prompt=7, completion=5):
    async def _fake(**kwargs):
        _fake.calls.append(kwargs)
        return SimpleNamespace(
            model=kwargs["model"],
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
            usage=SimpleNamespace(prompt_tokens=prompt, completion_tokens=completion),
        )
    _fake.calls = []
    return _fake


def test_register_login_me_and_organizations(client):
    email, headers = register(client, org="Analytical Engines")
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200 and me.json()["email"] == email

    login = client.post("/api/v1/auth/login", json={"email": email.upper(), "password": PASSWORD})
    assert login.status_code == 200

    orgs = client.get("/api/v1/auth/organizations", headers=headers).json()
    assert [(o["name"], o["role"]) for o in orgs] == [("Analytical Engines", "owner")]


def test_duplicate_registration_is_rejected(client):
    email, _ = register(client)
    r = client.post("/api/v1/auth/register", json={
        "email": email, "password": PASSWORD, "full_name": "Other", "organization_name": "Other",
    })
    assert r.status_code == 409


def test_login_failures_are_indistinguishable(client):
    email, _ = register(client)
    wrong = client.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password-123"})
    missing = client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "wrong-password-123"})
    assert wrong.status_code == missing.status_code == 401
    assert wrong.json() == missing.json()


@pytest.mark.parametrize("header", [None, "Bearer not-a-jwt", "Basic abc"])
def test_protected_endpoints_require_valid_token(client, header):
    headers = {"Authorization": header} if header else {}
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    r = client.post("/api/v1/chat/completions", headers=headers, json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 401


def test_tenant_isolation_between_two_accounts(client):
    _, alice = register(client, org="Alice Co")
    _, bob = register(client, org="Bob Co")
    alice_org = client.get("/api/v1/auth/organizations", headers=alice).json()[0]["id"]
    bob_orgs = client.get("/api/v1/auth/organizations", headers=bob).json()
    assert alice_org not in [o["id"] for o in bob_orgs]

    r = client.get("/api/v1/models", headers={**bob, "X-Organization-Id": alice_org})
    assert r.status_code == 403
    assert client.get("/api/v1/models", headers={**alice, "X-Organization-Id": alice_org}).status_code == 200


def test_chat_records_usage_and_rejects_unlisted_models(client, monkeypatch):
    fake = fake_completion()
    monkeypatch.setattr(chat_module.litellm, "acompletion", fake)
    _, headers = register(client)

    bad = client.post("/api/v1/chat/completions", headers=headers, json={
        "model": "ollama/anything", "messages": [{"role": "user", "content": "hi"}],
    })
    assert bad.status_code == 400
    assert fake.calls == []

    ok = client.post("/api/v1/chat/completions", headers=headers, json={"messages": [{"role": "user", "content": "hi"}]})
    assert ok.status_code == 200, ok.text
    assert ok.json()["content"] == "Hello from the model"
    assert ok.json()["usage"] == {"prompt_tokens": 7, "completion_tokens": 5}
    assert fake.calls[0]["model"] == "openai/gpt-4o-mini"
    assert fake.calls[0]["timeout"] == settings.llm_timeout_seconds


def test_daily_budget_blocks_further_calls(client, monkeypatch):
    monkeypatch.setattr(chat_module.litellm, "acompletion", fake_completion(prompt=60, completion=60))
    monkeypatch.setattr(settings, "daily_token_budget_per_user", 100)
    _, headers = register(client)
    body = {"messages": [{"role": "user", "content": "hi"}]}
    assert client.post("/api/v1/chat/completions", headers=headers, json=body).status_code == 200
    assert client.post("/api/v1/chat/completions", headers=headers, json=body).status_code == 429


def test_provider_errors_are_not_leaked(client, monkeypatch):
    async def boom(**kwargs):
        raise RuntimeError("secret upstream detail sk-live-123")
    monkeypatch.setattr(chat_module.litellm, "acompletion", boom)
    _, headers = register(client)
    r = client.post("/api/v1/chat/completions", headers=headers, json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 502
    assert "sk-live" not in r.text and "secret" not in r.text


def test_login_is_rate_limited(client, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_auth_per_minute", 3)
    body = {"email": "nobody@example.com", "password": "wrong-password-123"}
    codes = [client.post("/api/v1/auth/login", json=body).status_code for _ in range(4)]
    assert codes == [401, 401, 401, 429]


def test_security_headers_and_readiness(client):
    r = client.get("/readyz")
    assert r.status_code == 200
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"


def test_application_tables_have_row_level_security(client):
    import asyncio

    async def check():
        engine = create_async_engine(DB_URL, poolclass=NullPool)
        async with engine.connect() as conn:
            rows = (await conn.execute(text(
                "select relname from pg_class where relname in "
                "('users','organizations','memberships','usage_events') and relrowsecurity"
            ))).all()
        await engine.dispose()
        return {r[0] for r in rows}

    assert asyncio.run(check()) == {"users", "organizations", "memberships", "usage_events"}


def test_export_and_delete_account(client, monkeypatch):
    monkeypatch.setattr(chat_module.litellm, "acompletion", fake_completion())
    email, headers = register(client, org="Solo Co")
    client.post("/api/v1/chat/completions", headers=headers, json={"messages": [{"role": "user", "content": "hi"}]})

    export = client.get("/api/v1/auth/export", headers=headers)
    assert export.status_code == 200
    data = export.json()
    assert data["user"]["email"] == email
    assert len(data["usage_events"]) == 1 and "content" not in data["usage_events"][0]

    assert client.post("/api/v1/auth/account/delete", headers=headers, json={"password": "wrong-password-xyz"}).status_code == 401
    assert client.post("/api/v1/auth/account/delete", headers=headers, json={"password": PASSWORD}).status_code == 204
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}).status_code == 401


def test_admin_console_requires_platform_admin(client, monkeypatch):
    monkeypatch.setattr(chat_module.litellm, "acompletion", fake_completion())
    admin_email = f"admin-{uuid.uuid4().hex[:8]}@example.com"
    monkeypatch.setattr(settings, "admin_emails", admin_email.upper())
    _, admin = register(client, email=admin_email, org="Ops")
    _, user = register(client, org="Customer")
    client.post("/api/v1/chat/completions", headers=user, json={"messages": [{"role": "user", "content": "hi"}]})

    assert client.get("/api/v1/auth/me", headers=admin).json()["is_platform_admin"] is True
    assert client.get("/api/v1/auth/me", headers=user).json()["is_platform_admin"] is False
    for path in ("overview", "users", "organizations", "usage"):
        assert client.get(f"/api/v1/admin/{path}", headers=user).status_code == 403
        assert client.get(f"/api/v1/admin/{path}", headers=admin).status_code == 200, path

    overview = client.get("/api/v1/admin/overview", headers=admin).json()
    assert overview["users"] >= 2 and overview["tokens_total"] >= 12
    users = client.get("/api/v1/admin/users", headers=admin).json()
    assert all("password" not in k for row in users for k in row)
    usage = client.get("/api/v1/admin/usage", headers=admin).json()
    assert any(r["model"] == "openai/gpt-4o-mini" for r in usage)

    me_id = client.get("/api/v1/auth/me", headers=admin).json()["id"]
    assert client.post(f"/api/v1/admin/users/{me_id}/admin", headers=admin, json={"is_platform_admin": False}).status_code == 400
