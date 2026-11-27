from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # Rate limits (requests per window per client IP / user). In-process only:
    # run a single API instance or put a shared limiter in front for scale-out.
    rate_limit_enabled: bool = True
    rate_limit_auth_per_minute: int = 10
    rate_limit_chat_per_minute: int = 20

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
        if problems:
            raise ValueError("Invalid production configuration: " + "; ".join(problems))
        return self


settings = Settings()
