from functools import lru_cache
from os import getenv

from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "3DPromptStudio API"
    app_env: str = "development"
    database_url: str = "sqlite:///./.data/3dpromptstudio.db"
    model_storage_dir: str = "./.data/models"
    max_model_upload_bytes: int = 50 * 1024 * 1024
    ai_prompt_provider: str = "deterministic"
    openai_api_key: str | None = None
    openai_prompt_model: str = "gpt-4o-mini"


@lru_cache
def get_settings() -> Settings:
    return Settings(
        app_name=getenv("APP_NAME", "3DPromptStudio API"),
        app_env=getenv("APP_ENV", "development"),
        database_url=getenv("DATABASE_URL", "sqlite:///./.data/3dpromptstudio.db"),
        model_storage_dir=getenv("MODEL_STORAGE_DIR", "./.data/models"),
        max_model_upload_bytes=int(getenv("MAX_MODEL_UPLOAD_BYTES", str(50 * 1024 * 1024))),
        ai_prompt_provider=getenv("AI_PROMPT_PROVIDER", "deterministic"),
        openai_api_key=getenv("OPENAI_API_KEY"),
        openai_prompt_model=getenv("OPENAI_PROMPT_MODEL", "gpt-4o-mini"),
    )
