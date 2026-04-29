import json
import sqlite3

from app.schemas.workspace import (
    Workspace,
    WorkspacePatch,
    WorkspaceSnapshot,
    create_default_workspace,
    now_iso,
    snapshot_workspace,
)


def save_workspace(db: sqlite3.Connection, workspace: Workspace) -> Workspace:
    existing = db.execute(
        "SELECT created_at FROM workspaces WHERE project_id = ?",
        (workspace.project_id,),
    ).fetchone()
    created_at = existing["created_at"] if existing else workspace.updated_at

    db.execute(
        """
        INSERT INTO workspaces (
          project_id,
          workspace_id,
          model_id,
          current_variant_id,
          selected_tool,
          selected_part_id,
          right_panel_mode,
          workspace_state_json,
          has_unsaved_operations,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          model_id = excluded.model_id,
          current_variant_id = excluded.current_variant_id,
          selected_tool = excluded.selected_tool,
          selected_part_id = excluded.selected_part_id,
          right_panel_mode = excluded.right_panel_mode,
          workspace_state_json = excluded.workspace_state_json,
          has_unsaved_operations = excluded.has_unsaved_operations,
          updated_at = excluded.updated_at
        """,
        (
            workspace.project_id,
            workspace.workspace_id,
            workspace.model_id,
            workspace.current_variant_id,
            workspace.selected_tool,
            workspace.selected_part_id,
            workspace.right_panel_mode,
            workspace.model_dump_json(by_alias=True),
            int(workspace.has_unsaved_operations),
            created_at,
            workspace.updated_at,
        ),
    )
    db.commit()
    return workspace

def get_workspace(db: sqlite3.Connection, project_id: str) -> Workspace:
    record = db.execute(
        "SELECT workspace_state_json FROM workspaces WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    if not record:
        workspace = create_default_workspace(project_id)
        return save_workspace(db, workspace)

    try:
        return Workspace.model_validate(json.loads(record["workspace_state_json"]))
    except (json.JSONDecodeError, ValueError):
        workspace = create_default_workspace(project_id)
        return save_workspace(db, workspace)


def update_workspace(db: sqlite3.Connection, project_id: str, patch: WorkspacePatch) -> Workspace:
    current = get_workspace(db, project_id)
    patch_data = patch.model_dump(exclude_unset=True)

    viewport_data = current.viewport.model_dump()
    if "viewport" in patch_data and patch_data["viewport"] is not None:
        viewport_patch = patch_data.pop("viewport")
        visible_helpers = viewport_data.get("visible_helpers", {})
        if "visible_helpers" in viewport_patch and viewport_patch["visible_helpers"] is not None:
            visible_helpers = {**visible_helpers, **viewport_patch.pop("visible_helpers")}
        viewport_data = {**viewport_data, **viewport_patch, "visible_helpers": visible_helpers}

    next_data = current.model_dump()
    next_data.update(patch_data)
    next_data["viewport"] = viewport_data
    next_data["project_id"] = current.project_id
    next_data["workspace_id"] = current.workspace_id
    next_data["updated_at"] = now_iso()

    updated = Workspace.model_validate(next_data)
    updated.history.past = [*current.history.past, snapshot_workspace(current)][-50:]
    updated.history.future = []
    return save_workspace(db, updated)


def attach_model_to_workspace(db: sqlite3.Connection, project_id: str, model_id: str) -> Workspace:
    current = get_workspace(db, project_id)
    next_data = current.model_dump()
    next_data["model_id"] = model_id
    next_data["updated_at"] = now_iso()

    updated = Workspace.model_validate(next_data)
    updated.history.past = [*current.history.past, snapshot_workspace(current)][-50:]
    updated.history.future = []
    return save_workspace(db, updated)


def undo_workspace(db: sqlite3.Connection, project_id: str) -> Workspace:
    current = get_workspace(db, project_id)
    if not current.history.past:
        return current

    previous: WorkspaceSnapshot = current.history.past[-1]
    next_data = current.model_dump()
    next_data.update(previous.model_dump())
    next_data["history"] = {
        "past": [item.model_dump() for item in current.history.past[:-1]],
        "future": [
            *[item.model_dump() for item in current.history.future],
            snapshot_workspace(current).model_dump(),
        ][-50:],
    }
    next_data["updated_at"] = now_iso()

    return save_workspace(db, Workspace.model_validate(next_data))


def redo_workspace(db: sqlite3.Connection, project_id: str) -> Workspace:
    current = get_workspace(db, project_id)
    if not current.history.future:
        return current

    next_snapshot: WorkspaceSnapshot = current.history.future[-1]
    next_data = current.model_dump()
    next_data.update(next_snapshot.model_dump())
    next_data["history"] = {
        "past": [
            *[item.model_dump() for item in current.history.past],
            snapshot_workspace(current).model_dump(),
        ][-50:],
        "future": [item.model_dump() for item in current.history.future[:-1]],
    }
    next_data["updated_at"] = now_iso()

    return save_workspace(db, Workspace.model_validate(next_data))
