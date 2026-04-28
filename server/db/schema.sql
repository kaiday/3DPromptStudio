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
