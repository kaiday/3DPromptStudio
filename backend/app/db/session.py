import sqlite3
from collections.abc import Generator
from pathlib import Path

from app.core.config import get_settings

settings = get_settings()


def _sqlite_path(database_url: str) -> str:
    if not database_url.startswith("sqlite:///"):
        raise ValueError("Only sqlite:/// database URLs are supported in the MVP backend.")
    database_path = database_url.removeprefix("sqlite:///")
    return database_path or ":memory:"


def _ensure_sqlite_parent(database_path: str) -> None:
    if database_path == ":memory:":
        return
    Path(database_path).parent.mkdir(parents=True, exist_ok=True)


DATABASE_PATH = _sqlite_path(settings.database_url)
_ensure_sqlite_parent(DATABASE_PATH)


def init_db() -> None:
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS workspaces (
              project_id TEXT PRIMARY KEY,
              workspace_id TEXT NOT NULL,
              model_id TEXT,
              current_variant_id TEXT,
              selected_tool TEXT NOT NULL,
              selected_part_id TEXT,
              right_panel_mode TEXT NOT NULL,
              workspace_state_json TEXT NOT NULL,
              has_unsaved_operations INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS models (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              original_filename TEXT NOT NULL,
              content_type TEXT NOT NULL,
              size_bytes INTEGER NOT NULL,
              source TEXT NOT NULL,
              title TEXT,
              storage_path TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS idx_models_project_id ON models (project_id)")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS component_registries (
              project_id TEXT PRIMARY KEY,
              model_id TEXT,
              registry_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        connection.commit()


def get_db() -> Generator[sqlite3.Connection, None, None]:
    db = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    db.row_factory = sqlite3.Row
    try:
        yield db
    finally:
        db.close()
