import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import crypto, providers
from app.config import settings
from app.connections import require_manager

from tests.test_integration import DB_URL, client, fake_completion, register  # noqa: F401
from app import chat as chat_module, connections as connections_module


@pytest.fixture(autouse=True)
def _encryption_key(monkeypatch):
    monkeypatch.setattr(settings, "encryption_key", "unit-test-encryption-key-with-32-chars!!")


def test_encrypt_round_trip_and_hint():
    token = crypto.encrypt("sk-or-v1-abcdef123456")
    assert "abcdef" not in token
    assert crypto.decrypt(token) == "sk-or-v1-abcdef123456"
    assert crypto.hint("sk-or-v1-abcdef123456") == "…3456"


def test_decrypt_fails_with_rotated_key(monkeypatch):
    token = crypto.encrypt("secret-value-123")
    monkeypatch.setattr(settings, "encryption_key", "another-key-with-at-least-32-characters")
    with pytest.raises(crypto.SecretUnavailable):
        crypto.decrypt(token)


def test_missing_encryption_key_is_refused(monkeypatch):
    monkeypatch.setattr(settings, "encryption_key", "")
    with pytest.raises(crypto.SecretUnavailable):
        crypto.encrypt("x")


@pytest.mark.parametrize("model", ["qwen/qwen-2.5-72b-instruct", "deepseek-chat", "accounts/fireworks/models/x", "llama3.1:8b"])
def test_free_text_model_names_are_accepted(model):
    assert providers.litellm_model("openrouter", model).startswith("openrouter/")


@pytest.mark.parametrize("model", ["", "a b", "x;rm -rf", "x" * 201])
def test_invalid_model_names_are_rejected(model):
    with pytest.raises(HTTPException):
        providers.litellm_model("openrouter", model)


@pytest.mark.parametrize("url", ["http://example.com", "https://127.0.0.1:11434", "https://169.254.169.254/latest",
                                 "https://user:pw@example.com", "ftp://example.com", "https://localhost"])
def test_base_url_ssrf_guard(url):
    with pytest.raises(HTTPException):
        providers.validate_base_url(url, allow_private=False)


def test_private_endpoints_allowed_only_when_enabled():
    assert providers.validate_base_url("http://ollama:11434/", allow_private=True) == "http://ollama:11434"


def test_members_cannot_manage_connections():
    with pytest.raises(HTTPException) as exc:
        require_manager(SimpleNamespace(role="member"))
    assert exc.value.status_code == 403
    require_manager(SimpleNamespace(role="owner"))


pytestmark_db = pytest.mark.skipif(not DB_URL, reason="TEST_DATABASE_URL not set")


@pytestmark_db
def test_byok_connection_lifecycle_and_chat(client, monkeypatch):
    fake = fake_completion(content="hi from qwen")
    monkeypatch.setattr(chat_module.litellm, "acompletion", fake)
    monkeypatch.setattr(connections_module.litellm, "acompletion", fake)
    _, alice = register(client, org="Alice")
    _, bob = register(client, org="Bob")

    assert client.get("/api/v1/models/providers", headers=alice).status_code == 200
    r = client.post("/api/v1/models/connections", headers=alice, json={
        "provider": "openrouter", "label": "My OpenRouter", "api_key": "sk-or-v1-supersecretvalue9876",
        "default_model": "qwen/qwen-2.5-72b-instruct"})
    assert r.status_code == 201, r.text
    conn = r.json()
    assert conn["api_key_hint"] == "…9876" and "supersecret" not in r.text

    listed = client.get("/api/v1/models/connections", headers=alice)
    assert "supersecret" not in listed.text and len(listed.json()) == 1
    assert client.get("/api/v1/models/connections", headers=bob).json() == []

    ok = client.post("/api/v1/chat/completions", headers=alice, json={
        "connection_id": conn["id"], "messages": [{"role": "user", "content": "hi"}]})
    assert ok.status_code == 200, ok.text
    assert ok.json()["model"] == "openrouter/qwen/qwen-2.5-72b-instruct"
    assert fake.calls[-1]["api_key"] == "sk-or-v1-supersecretvalue9876"

    other = client.post("/api/v1/chat/completions", headers=alice, json={
        "connection_id": conn["id"], "model": "deepseek/deepseek-chat", "messages": [{"role": "user", "content": "hi"}]})
    assert other.json()["model"] == "openrouter/deepseek/deepseek-chat"

    stolen = client.post("/api/v1/chat/completions", headers=bob, json={
        "connection_id": conn["id"], "messages": [{"role": "user", "content": "hi"}]})
    assert stolen.status_code == 404

    test = client.post(f"/api/v1/models/connections/{conn['id']}/test", headers=alice, json={"model": "qwen/qwen3-32b"})
    assert test.json()["ok"] is True

    assert client.delete(f"/api/v1/models/connections/{conn['id']}", headers=bob).status_code == 404
    assert client.delete(f"/api/v1/models/connections/{conn['id']}", headers=alice).status_code == 204


@pytestmark_db
def test_connection_validation(client):
    _, h = register(client)
    missing_key = client.post("/api/v1/models/connections", headers=h, json={"provider": "anthropic", "label": "x"})
    assert missing_key.status_code == 400
    bad_base = client.post("/api/v1/models/connections", headers=h, json={
        "provider": "ollama", "label": "x", "api_base": "http://10.0.0.5:11434"})
    assert bad_base.status_code == 400
    unknown = client.post("/api/v1/models/connections", headers=h, json={"provider": "nope", "label": "x", "api_key": "k"})
    assert unknown.status_code == 400


@pytestmark_db
def test_connection_test_reports_provider_error_without_key(client, monkeypatch):
    async def boom(**kwargs):
        raise RuntimeError(f"AuthenticationError: invalid key {kwargs['api_key']}")
    monkeypatch.setattr(connections_module.litellm, "acompletion", boom)
    _, h = register(client)
    conn = client.post("/api/v1/models/connections", headers=h, json={
        "provider": "deepseek", "label": "DS", "api_key": "sk-abcdefghijklmnop1234"}).json()
    r = client.post(f"/api/v1/models/connections/{conn['id']}/test", headers=h, json={"model": "deepseek-chat"})
    assert r.json()["ok"] is False
    assert "abcdefghijkl" not in r.text


@pytestmark_db
def test_check_key_before_saving(client, monkeypatch):
    calls = []

    async def ok(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(model=kwargs["model"], choices=[SimpleNamespace(message=SimpleNamespace(content="ok"))])
    monkeypatch.setattr(connections_module.litellm, "acompletion", ok)
    _, h = register(client)
    r = client.post("/api/v1/models/check", headers=h, json={"provider": "groq", "api_key": "gsk_testkey1234567890", "model": "llama-3.3-70b-versatile"})
    assert r.status_code == 200 and r.json()["ok"] is True
    assert calls[-1]["model"] == "groq/llama-3.3-70b-versatile" and calls[-1]["api_key"] == "gsk_testkey1234567890"
    assert client.get("/api/v1/models/connections", headers=h).json() == []

    async def boom(**kwargs):
        raise RuntimeError(f"AuthenticationError: bad key {kwargs['api_key']}")
    monkeypatch.setattr(connections_module.litellm, "acompletion", boom)
    bad = client.post("/api/v1/models/check", headers=h, json={"provider": "deepseek", "api_key": "sk-abcdefghijklmnop1234", "model": "deepseek-chat"})
    assert bad.json()["ok"] is False and "abcdefghijkl" not in bad.text
    missing = client.post("/api/v1/models/check", headers=h, json={"provider": "anthropic", "model": "claude-sonnet-4-5"})
    assert missing.status_code == 400
