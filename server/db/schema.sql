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

CREATE TABLE IF NOT EXISTS workspace_history (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workspace_history_project_id ON workspace_history (project_id);

CREATE TABLE IF NOT EXISTS component_registries (
  project_id TEXT PRIMARY KEY,
  model_id TEXT,
  registry_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS model_components (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  model_id TEXT,
  mesh_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  material_name TEXT,
  editable INTEGER NOT NULL DEFAULT 1,
  allowed_operations_json TEXT NOT NULL,
  transform_bounds_json TEXT NOT NULL,
  original_snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_model_components_project_id ON model_components (project_id);
CREATE INDEX IF NOT EXISTS idx_model_components_model_id ON model_components (model_id);

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
  points_json TEXT,
  screen_points_json TEXT,
  cut_plane_json TEXT,
  label TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL DEFAULT 'anonymous',
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_annotations_project_id ON annotations (project_id);
CREATE INDEX IF NOT EXISTS idx_annotations_part_id ON annotations (part_id);
CREATE INDEX IF NOT EXISTS idx_annotations_variant_id ON annotations (variant_id);
