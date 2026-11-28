# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app


def test_readiness_returns_ready_when_database_responds():
    database = AsyncMock()
    async def override_get_db():
        yield database

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = TestClient(app).get("/readyz")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready" and body["database"] == "ok"
    assert database.execute.await_count >= 1


def test_readiness_returns_503_when_database_is_unavailable():
    database = AsyncMock()
    database.execute.side_effect = RuntimeError("database unavailable")

    async def override_get_db():
        yield database

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = TestClient(app).get("/readyz")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 503
    assert response.json()["detail"] == "Database is not ready"
