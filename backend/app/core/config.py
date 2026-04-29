from functools import lru_cache
from os import getenv

from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "3DPromptStudio API"
    app_env: str = "development"
    database_url: str = "sqlite:///./.data/3dpromptstudio.db"


@lru_cache
def get_settings() -> Settings:
    return Settings(
        app_name=getenv("APP_NAME", "3DPromptStudio API"),
        app_env=getenv("APP_ENV", "development"),
        database_url=getenv("DATABASE_URL", "sqlite:///./.data/3dpromptstudio.db"),
    )

