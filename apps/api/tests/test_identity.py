# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import jwt
import pytest
from pydantic import ValidationError
from fastapi import HTTPException

from app.auth import create_access_token
from app.config import settings
from app.identity import RegisterRequest, current_user


def test_registration_trims_names():
    request = RegisterRequest(
        email="person@example.com",
        password="a-very-long-password",
        full_name="  Ada Lovelace  ",
        organization_name="  Analytical Engines  ",
    )
    assert request.full_name == "Ada Lovelace"
    assert request.organization_name == "Analytical Engines"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("full_name", "   "),
        ("organization_name", "   "),
        ("organization_name", "A"),
    ],
)
def test_registration_rejects_blank_or_short_names(field, value):
    data = {
        "email": "person@example.com",
        "password": "a-very-long-password",
        "full_name": "Ada Lovelace",
        "organization_name": "Analytical Engines",
    }
    data[field] = value
    with pytest.raises(ValidationError):
        RegisterRequest(**data)


def test_registration_rejects_password_over_limit():
    with pytest.raises(ValidationError):
        RegisterRequest(
            email="person@example.com",
            password="x" * 129,
            full_name="Ada Lovelace",
            organization_name="Analytical Engines",
        )


def test_current_user_rejects_malformed_token(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "test-secret-with-at-least-32-characters")
    db = AsyncMock()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(current_user(token="not-a-jwt", db=db))
    assert exc.value.status_code == 401
    db.scalar.assert_not_awaited()


def test_current_user_rejects_expired_token(monkeypatch):
    secret = "test-secret-with-at-least-32-characters"
    monkeypatch.setattr(settings, "jwt_secret", secret)
    token = jwt.encode(
        {"sub": "00000000-0000-0000-0000-000000000001",
         "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
        secret,
        algorithm="HS256",
    )
    db = AsyncMock()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(current_user(token=token, db=db))
    assert exc.value.status_code == 401
    db.scalar.assert_not_awaited()


def test_current_user_rejects_non_uuid_subject(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "test-secret-with-at-least-32-characters")
    token = create_access_token("not-a-uuid")
    db = AsyncMock()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(current_user(token=token, db=db))
    assert exc.value.status_code == 401
    db.scalar.assert_not_awaited()
