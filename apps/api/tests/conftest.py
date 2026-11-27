import os

import pytest

os.environ.setdefault("JWT_SECRET", "test-secret-with-at-least-32-characters-long")

from app.config import settings  # noqa: E402
from app.ratelimit import limiter  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture(autouse=True)
def _jwt_secret(monkeypatch):
    if len(settings.jwt_secret) < 32:
        monkeypatch.setattr(settings, "jwt_secret", "test-secret-with-at-least-32-characters-long")
