from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    cors_origins: str = "http://localhost:5173"
    litellm_model: str = "gpt-4o-mini"
    openai_api_key: str = ""
    database_url: str = "postgresql+asyncpg://galdus:galdus_dev_only@db:5432/galdus"
    jwt_secret: str = ""
    jwt_expire_minutes: int = 30

settings = Settings()
