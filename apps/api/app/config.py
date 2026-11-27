from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    cors_origins: str = "http://localhost:5173"
    litellm_model: str = "gpt-4o-mini"
    openai_api_key: str = ""

settings = Settings()
