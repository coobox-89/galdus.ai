"""Platform models are offered only when the server holds their credentials.

Regression: render.yaml sets ALLOWED_MODELS=openai/gpt-4o-mini while OPENAI_API_KEY is optional; the
console then showed "OpenAI" in the chat and every message failed.
"""
import pytest
from fastapi import HTTPException

from app import chat
from app.config import settings
from tests.test_integration import DB_URL, client, register  # noqa: F401

db = pytest.mark.skipif(not DB_URL, reason="TEST_DATABASE_URL not set")


def test_platform_model_without_key_is_not_offered(monkeypatch):
    monkeypatch.setattr(settings, "allowed_models", "openai/gpt-4o-mini")
    monkeypatch.setattr(settings, "litellm_model", "openai/gpt-4o-mini")
    monkeypatch.setattr(settings, "openai_api_key", "")
    assert chat.usable_platform_models() == []
    with pytest.raises(HTTPException) as err:
        chat.provider_kwargs("openai/gpt-4o-mini")
    assert err.value.status_code == 503 and "Open Models" in err.value.detail


def test_platform_model_with_key_is_offered(monkeypatch):
    monkeypatch.setattr(settings, "allowed_models", "openai/gpt-4o-mini")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test-not-real")
    assert chat.usable_platform_models() == ["openai/gpt-4o-mini"]
    assert chat.provider_kwargs("openai/gpt-4o-mini") == {"api_key": "sk-test-not-real"}


def test_ollama_platform_model_needs_a_base_url(monkeypatch):
    monkeypatch.setattr(settings, "allowed_models", "ollama/llama3.1")
    monkeypatch.setattr(settings, "ollama_api_base", "")
    assert chat.usable_platform_models() == []
    monkeypatch.setattr(settings, "ollama_api_base", "http://localhost:11434")
    assert chat.usable_platform_models() == ["ollama/llama3.1"]


@db
def test_models_endpoint_and_chat_explain_a_missing_model(client, monkeypatch):
    _, h = register(client)
    monkeypatch.setattr(settings, "allowed_models", "openai/gpt-4o-mini")
    monkeypatch.setattr(settings, "litellm_model", "openai/gpt-4o-mini")
    monkeypatch.setattr(settings, "openai_api_key", "")
    assert client.get("/api/v1/models", headers=h).json() == {"default": "", "models": []}
    conv = client.post("/api/v1/conversations", headers=h, json={}).json()
    r = client.post(f"/api/v1/conversations/{conv['id']}/messages", headers=h, json={"content": "ciao"})
    assert r.status_code == 503 and "No model is connected yet" in r.json()["detail"]


@db
def test_sign_in_upgrades_old_password_hashes(client):
    import asyncio
    from pwdlib import PasswordHash
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool
    email, _ = register(client)
    old = PasswordHash.recommended().hash("a-very-long-test-password")  # the previous, heavier parameters

    async def sql(q, **kw):
        engine = create_async_engine(DB_URL, poolclass=NullPool)
        async with engine.begin() as c:
            r = await c.execute(text(q), kw)
            value = r.scalar() if r.returns_rows else None
        await engine.dispose()
        return value
    asyncio.run(sql("update users set password_hash = :h where email = :e", h=old, e=email))
    assert client.post("/api/v1/auth/login", json={"email": email, "password": "a-very-long-test-password"}).status_code == 200
    stored = asyncio.run(sql("select password_hash from users where email = :e", e=email))
    assert stored.startswith("$argon2id$v=19$m=19456,t=2,p=1$")
    assert client.post("/api/v1/auth/login", json={"email": email, "password": "a-very-long-test-password"}).status_code == 200
