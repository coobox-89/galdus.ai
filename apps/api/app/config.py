from urllib.parse import urlparse

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Values that come from .env.example, CI or local development and must never reach production.
_PLACEHOLDER_MARKERS = ("replace-with", "change-me", "changeme", "galdus_dev_only", "ci-only", "test-secret", "example-secret")


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Runtime
    environment: str = "development"  # development | test | production
    enable_api_docs: bool | None = None  # defaults to True outside production
    cors_origins: str = "http://localhost:5173"
    max_request_bytes: int = 1_000_000

    # Database
    database_url: str = "postgresql+asyncpg://galdus:galdus_dev_only@db:5432/galdus"
    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_pool_timeout: int = 30
    db_pool_recycle: int = 1800
    # Set to true when connecting through a transaction-mode pooler (e.g. Supabase
    # Supavisor on port 6543), which does not support prepared statements.
    db_transaction_pooler: bool = False

    # Identity
    jwt_secret: str = ""
    jwt_expire_minutes: int = 30
    # Comma-separated emails that become platform admins when they register.
    admin_emails: str = ""

    # Models
    litellm_model: str = "gpt-4o-mini"
    # Comma-separated allowlist of model identifiers users may request.
    # Defaults to LITELLM_MODEL only.
    allowed_models: str = ""
    openai_api_key: str = ""
    ollama_api_base: str = ""
    llm_timeout_seconds: float = 60.0
    llm_max_retries: int = 1
    llm_max_output_tokens: int = 2048
    # Daily per-user token budget (prompt + completion). 0 disables the budget.
    daily_token_budget_per_user: int = 200_000

    # BYOK: encrypts provider keys stored per organization.
    encryption_key: str = ""
    # Allow http/private-network base URLs for self-hosted models (self-host installs only).
    allow_private_model_endpoints: bool = False

    # Public URLs used to build OAuth redirect URIs and links in emails.
    public_api_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:5173"
    # OAuth apps (login and cloud-drive connectors). Empty values hide the feature.
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    microsoft_client_id: str = ""
    microsoft_client_secret: str = ""
    microsoft_tenant: str = "common"
    # Outgoing email (any SMTP provider: Resend, Brevo, SES, Mailgun...). Empty disables email.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # Block password sign-in until the email address is verified (only when SMTP is configured).
    require_email_verification: bool = False

    # Shared secret for POST /api/v1/automation/tick (scheduler). Empty disables schedules.
    automation_token: str = ""

    # Rate limits (requests per minute per client IP / user). RATE_LIMIT_BACKEND=memory counts per
    # instance; postgres shares the counters through the database across every instance.
    rate_limit_enabled: bool = True
    # memory: per instance. postgres: shared across every API instance through the database.
    rate_limit_backend: str = "memory"
    rate_limit_auth_per_minute: int = 10
    rate_limit_chat_per_minute: int = 20
    # Per-account lockout: after this many failed passwords (or second-factor codes) in the window,
    # further attempts for that account get 429 until the window ends. Independent of the client IP.
    login_max_failures: int = 5
    login_lockout_minutes: int = 15
    mfa_max_failures: int = 10
    # Optional header set by your edge proxy with the real client IP (e.g. "cf-connecting-ip" or
    # "true-client-ip"). Empty: use the connection address as rewritten by uvicorn (FORWARDED_ALLOW_IPS).
    client_ip_header: str = ""

    # Logs: "json" (one object per line, for log drains) or "text".
    log_format: str = "json"
    log_level: str = "INFO"

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return _split_csv(self.cors_origins)

    @property
    def admin_email_list(self) -> set[str]:
        return {e.lower() for e in _split_csv(self.admin_emails)}

    @property
    def allowed_model_list(self) -> list[str]:
        models = _split_csv(self.allowed_models)
        return models or [self.litellm_model]

    @property
    def docs_enabled(self) -> bool:
        if self.enable_api_docs is not None:
            return self.enable_api_docs
        return not self.is_production

    @model_validator(mode="after")
    def validate_production(self):
        if not self.is_production:
            return self
        problems = []
        if len(self.jwt_secret) < 32:
            problems.append("JWT_SECRET must be at least 32 characters")
        origins = self.cors_origin_list
        if not origins or "*" in origins:
            problems.append("CORS_ORIGINS must list explicit origins")
        if any(o.startswith("http://") and "localhost" not in o for o in origins):
            problems.append("CORS_ORIGINS must use https in production")
        if "galdus_dev_only" in self.database_url:
            problems.append("DATABASE_URL must be set in production")
        if self.litellm_model not in self.allowed_model_list:
            problems.append("LITELLM_MODEL must be included in ALLOWED_MODELS")
        if len(self.encryption_key) < 32:
            problems.append("ENCRYPTION_KEY must be set (at least 32 characters): it protects provider keys, MFA secrets and OAuth state")
        if self.encryption_key and self.encryption_key == self.jwt_secret:
            problems.append("ENCRYPTION_KEY and JWT_SECRET must be different values")
        for name in ("jwt_secret", "encryption_key", "database_url", "automation_token", "smtp_password"):
            value = (getattr(self, name) or "").lower()
            if any(marker in value for marker in _PLACEHOLDER_MARKERS):
                problems.append(f"{name.upper()} still holds a development or example value")
        for name in ("public_api_url", "frontend_url"):
            url = urlparse(getattr(self, name))
            if url.scheme != "https" or url.hostname in (None, "localhost", "127.0.0.1"):
                problems.append(f"{name.upper()} must be a public https URL in production")
        if bool(self.smtp_host) != bool(self.smtp_from):
            problems.append("SMTP_HOST and SMTP_FROM must be set together")
        if self.rate_limit_backend not in ("memory", "postgres"):
            problems.append("RATE_LIMIT_BACKEND must be memory or postgres")
        if not self.rate_limit_enabled:
            problems.append("RATE_LIMIT_ENABLED cannot be false in production")
        if problems:
            raise ValueError("Invalid production configuration: " + "; ".join(problems))
        return self


settings = Settings()
