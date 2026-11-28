# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

import jwt
import pytest

from app import auth
from app.config import settings


def test_access_token_round_trip(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "test-secret-with-at-least-32-characters")
    token = auth.create_access_token("user-123")
    assert auth.decode_access_token(token) == "user-123"


def test_access_token_rejects_wrong_secret(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "test-secret-with-at-least-32-characters")
    token = auth.create_access_token("user-123")
    monkeypatch.setattr(settings, "jwt_secret", "another-secret-with-at-least-32-characters")
    with pytest.raises(jwt.InvalidTokenError):
        auth.decode_access_token(token)


def test_password_hash_verification():
    hashed = auth.hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"
    assert auth.verify_password("correct horse battery staple", hashed)
    assert not auth.verify_password("wrong password", hashed)
