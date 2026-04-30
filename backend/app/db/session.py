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
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS component_interactions (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              component_id TEXT NOT NULL,
              kind TEXT NOT NULL,
              label TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_component_interactions_project_id ON component_interactions (project_id)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_component_interactions_component_id ON component_interactions (component_id)"
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS annotations (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              variant_id TEXT,
              part_id TEXT,
              type TEXT NOT NULL,
              target_type TEXT NOT NULL,
              position_json TEXT,
              normal_json TEXT,
              screen_position_json TEXT,
              points_json TEXT NOT NULL,
              screen_points_json TEXT NOT NULL,
              cut_plane_json TEXT,
              label TEXT NOT NULL DEFAULT '',
              note TEXT NOT NULL DEFAULT '',
              author_id TEXT NOT NULL DEFAULT 'anonymous',
              session_id TEXT,
              status TEXT NOT NULL DEFAULT 'open',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS idx_annotations_project_id ON annotations (project_id)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_annotations_part_id ON annotations (part_id)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_annotations_variant_id ON annotations (variant_id)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations (type)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_annotations_status ON annotations (status)")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS export_requests (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              model_id TEXT,
              current_variant_id TEXT,
              status TEXT NOT NULL,
              mode TEXT NOT NULL,
              options_json TEXT NOT NULL,
              workspace_snapshot_json TEXT NOT NULL,
              message TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS idx_export_requests_project_id ON export_requests (project_id)")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS generation_jobs (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              prompt TEXT NOT NULL,
              status TEXT NOT NULL,
              provider TEXT NOT NULL,
              placement_json TEXT NOT NULL,
              style TEXT,
              mode TEXT NOT NULL DEFAULT 'asset',
              metadata_json TEXT NOT NULL DEFAULT '{}',
              asset_id TEXT,
              model_url TEXT,
              metadata_url TEXT,
              error_message TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              completed_at TEXT
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS idx_generation_jobs_project_id ON generation_jobs (project_id)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs (status)")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS generation_events (
              id TEXT PRIMARY KEY,
              job_id TEXT NOT NULL,
              project_id TEXT NOT NULL,
              type TEXT NOT NULL,
              message TEXT NOT NULL DEFAULT '',
              payload_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS idx_generation_events_job_id ON generation_events (job_id)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_generation_events_project_id ON generation_events (project_id)")
        connection.commit()


def get_db() -> Generator[sqlite3.Connection, None, None]:
    db = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    db.row_factory = sqlite3.Row
    try:
        yield db
    finally:
        db.close()
