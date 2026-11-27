import pytest
from pydantic import ValidationError

from app.config import Settings

PROD = dict(
    environment="production",
    jwt_secret="x" * 48,
    cors_origins="https://galdus.netlify.app",
    database_url="postgresql+asyncpg://app:pw@db.example.com:5432/postgres?ssl=require",
    litellm_model="openai/gpt-4o-mini",
    encryption_key="k" * 40,
    public_api_url="https://api.galdus.example",
    frontend_url="https://app.galdus.example",
)


def test_valid_production_settings():
    s = Settings(_env_file=None, **PROD)
    assert s.is_production
    assert s.docs_enabled is False
    assert s.allowed_model_list == ["openai/gpt-4o-mini"]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("jwt_secret", "short"),
        ("cors_origins", "*"),
        ("cors_origins", "http://galdus.example.com"),
        ("database_url", "postgresql+asyncpg://galdus:galdus_dev_only@db:5432/galdus"),
        # Phase 1 review: production must refuse missing, placeholder or development values.
        ("encryption_key", ""),
        ("encryption_key", "short"),
        ("encryption_key", "x" * 48),  # same as JWT_SECRET
        ("jwt_secret", "replace-with-at-least-32-random-characters"),
        ("jwt_secret", "ci-only-secret-with-at-least-32-characters"),
        ("encryption_key", "replace-with-at-least-32-random-characters"),
        ("public_api_url", "http://localhost:8000"),
        ("frontend_url", "http://localhost:5173"),
        ("frontend_url", "http://app.galdus.example"),
        ("smtp_host", "smtp.example.com"),  # without SMTP_FROM
        ("rate_limit_backend", "redis"),
        ("rate_limit_enabled", False),
    ],
)
def test_production_rejects_unsafe_settings(field, value):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{**PROD, field: value})


def test_default_model_must_be_allowlisted_in_production():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **PROD, allowed_models="openai/gpt-4o")


def test_development_defaults_enable_docs():
    assert Settings(_env_file=None).docs_enabled is True
