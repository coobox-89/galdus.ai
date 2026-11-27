import hashlib
from types import SimpleNamespace

import pytest

from app import chat as chat_module, knowledge as knowledge_module
from app.config import settings
from app.knowledge import chunk_text
from tests.test_integration import DB_URL, client, fake_completion, register  # noqa: F401

db = pytest.mark.skipif(not DB_URL, reason="TEST_DATABASE_URL not set")


@pytest.fixture(autouse=True)
def _keys(monkeypatch):
    monkeypatch.setattr(settings, "encryption_key", "unit-test-encryption-key-with-32-chars!!")


def test_chunking_respects_size_and_overlap():
    text = "\n\n".join(f"Paragraph {i} " + "word " * 60 for i in range(20))
    chunks = chunk_text(text, size=500, overlap=100)
    assert len(chunks) > 5
    assert all(len(c) <= 700 for c in chunks)
    assert chunk_text("short") == ["short"]
    long = chunk_text("x" * 3000, size=1000, overlap=100)
    assert len(long) >= 3


def fake_embedding(**kwargs):
    async def _e(**kw):
        vecs = []
        for t in kw["input"]:
            h = hashlib.sha256(t.lower().encode()).digest()
            vec = [b / 255 for b in h[:8]]
            if "galdus" in t.lower():
                vec = [1.0] * 8
            vecs.append({"embedding": vec})
        return SimpleNamespace(data=vecs)
    return _e


def connection(client, headers):
    return client.post("/api/v1/models/connections", headers=headers, json={
        "provider": "openai", "label": "OpenAI", "api_key": "sk-test-key-1234567890", "default_model": "gpt-4o-mini"}).json()


@db
def test_full_text_collection_search_and_isolation(client):
    _, alice = register(client, org="Alice")
    _, bob = register(client, org="Bob")
    col = client.post("/api/v1/knowledge/collections", headers=alice, json={"name": "Handbook"}).json()
    assert col["search_mode"] == "full-text"
    doc = client.post(f"/api/v1/knowledge/collections/{col['id']}/documents/text", headers=alice, json={
        "title": "Holidays", "content": "Employees get 26 vacation days per year.\n\nThe office closes in August."})
    assert doc.status_code == 201 and doc.json()["chunks"] == 1
    hits = client.post(f"/api/v1/knowledge/collections/{col['id']}/search", headers=alice, json={"query": "how many vacation days?"}).json()
    assert hits and hits[0]["title"] == "Holidays"
    assert client.post(f"/api/v1/knowledge/collections/{col['id']}/search", headers=bob, json={"query": "vacation"}).status_code == 404
    assert client.get("/api/v1/knowledge/collections", headers=bob).json() == []
    assert client.delete(f"/api/v1/knowledge/documents/{doc.json()['id']}", headers=bob).status_code == 404


@db
def test_upload_text_file(client):
    _, h = register(client)
    col = client.post("/api/v1/knowledge/collections", headers=h, json={"name": "Files"}).json()
    r = client.post(f"/api/v1/knowledge/collections/{col['id']}/documents/upload", headers=h,
                    files={"file": ("notes.md", b"# Runbook\n\nRestart the RDS instance from the console.", "text/markdown")})
    assert r.status_code == 201, r.text
    bad = client.post(f"/api/v1/knowledge/collections/{col['id']}/documents/upload", headers=h,
                      files={"file": ("virus.exe", b"MZ", "application/octet-stream")})
    assert bad.status_code == 400


@db
def test_semantic_collection_uses_embeddings(client, monkeypatch):
    monkeypatch.setattr(knowledge_module.litellm, "aembedding", fake_embedding())
    _, h = register(client)
    conn = connection(client, h)
    col = client.post("/api/v1/knowledge/collections", headers=h, json={
        "name": "Semantic", "connection_id": conn["id"], "embedding_model": "text-embedding-3-small"}).json()
    assert col["search_mode"] == "semantic"
    client.post(f"/api/v1/knowledge/collections/{col['id']}/documents/text", headers=h, json={"title": "About", "content": "Galdus is an open AI platform."})
    client.post(f"/api/v1/knowledge/collections/{col['id']}/documents/text", headers=h, json={"title": "Other", "content": "Unrelated cooking recipe."})
    hits = client.post(f"/api/v1/knowledge/collections/{col['id']}/search", headers=h, json={"query": "what is galdus"}).json()
    assert hits[0]["title"] == "About"


@db
def test_agent_with_knowledge_cites_sources_and_records_run(client, monkeypatch):
    fake = fake_completion(content="You get 26 days [1].")
    monkeypatch.setattr(chat_module.litellm, "acompletion", fake)
    _, h = register(client)
    conn = connection(client, h)
    col = client.post("/api/v1/knowledge/collections", headers=h, json={"name": "HR"}).json()
    client.post(f"/api/v1/knowledge/collections/{col['id']}/documents/text", headers=h, json={"title": "Policy", "content": "Employees get 26 vacation days."})
    agent = client.post("/api/v1/agents", headers=h, json={
        "name": "HR helper", "instructions": "Answer HR questions.", "connection_id": conn["id"],
        "model": "gpt-4o-mini", "collection_id": col["id"]})
    assert agent.status_code == 201, agent.text
    run = client.post(f"/api/v1/agents/{agent.json()['id']}/runs", headers=h, json={"input": "How many vacation days?"}).json()
    assert run["status"] == "succeeded" and run["sources"][0]["title"] == "Policy"
    system = fake.calls[-1]["messages"][0]["content"]
    assert "[1] Policy" in system and "26 vacation days" in system
    runs = client.get("/api/v1/runs", headers=h).json()
    assert runs[0]["id"] == run["id"]


@db
def test_agent_failure_is_recorded(client, monkeypatch):
    async def boom(**kwargs):
        raise RuntimeError("down")
    monkeypatch.setattr(chat_module.litellm, "acompletion", boom)
    _, h = register(client)
    conn = connection(client, h)
    agent = client.post("/api/v1/agents", headers=h, json={"name": "A", "instructions": "x", "connection_id": conn["id"], "model": "gpt-4o-mini"}).json()
    run = client.post(f"/api/v1/agents/{agent['id']}/runs", headers=h, json={"input": "hi"}).json()
    assert run["status"] == "failed" and "provider" in run["error"]


@db
def test_apps_catalog_and_run(client, monkeypatch):
    fake = fake_completion(content="Summary.")
    monkeypatch.setattr(chat_module.litellm, "acompletion", fake)
    _, h = register(client)
    conn = connection(client, h)
    apps = {a["id"] for a in client.get("/api/v1/apps", headers=h).json()}
    assert {"document-qa", "summarize", "rewrite", "email", "translate"} <= apps
    r = client.post("/api/v1/apps/summarize/runs", headers=h, json={
        "connection_id": conn["id"], "model": "gpt-4o-mini", "inputs": {"text": "Long text here.", "length": "evil"}}).json()
    assert r["status"] == "succeeded" and r["app_id"] == "summarize"
    assert "Write a short summary" in fake.calls[-1]["messages"][1]["content"]
    missing = client.post("/api/v1/apps/document-qa/runs", headers=h, json={"connection_id": conn["id"], "model": "gpt-4o-mini", "inputs": {"question": "q"}})
    assert missing.status_code == 400


@db
def test_agent_refs_must_belong_to_workspace(client):
    _, alice = register(client)
    _, bob = register(client)
    conn = connection(client, alice)
    r = client.post("/api/v1/agents", headers=bob, json={"name": "x", "instructions": "x", "connection_id": conn["id"], "model": "m"})
    assert r.status_code == 404
