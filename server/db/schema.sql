CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  model_id TEXT,
  current_variant_id TEXT,
  selected_tool TEXT NOT NULL DEFAULT 'mouse',
  selected_part_id TEXT,
  right_panel_mode TEXT NOT NULL DEFAULT 'config',
  workspace_state_json TEXT NOT NULL,
  has_unsaved_operations INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workspaces_project_id ON workspaces (project_id);
