import json
import sqlite3
from uuid import uuid4

from fastapi import HTTPException, status

from app.schemas.export import ExportRecord, ExportRequestPayload, now_iso
from app.services.workspace_service import get_workspace

FRONTEND_EXPORT_MESSAGE = "MVP export is performed client-side from the current Three.js scene."
UNSUPPORTED_EXPORT_MESSAGE = "Server-side GLB export requires the future Blender worker pipeline."


def _workspace_snapshot(workspace) -> dict:
    return {
        "workspaceId": workspace.workspace_id,
        "projectId": workspace.project_id,
        "modelId": workspace.model_id,
        "currentVariantId": workspace.current_variant_id,
        "scene": workspace.scene.model_dump(by_alias=True),
        "lastOperations": [operation.model_dump(by_alias=True) for operation in workspace.last_operations],
        "hasUnsavedOperations": workspace.has_unsaved_operations,
        "updatedAt": workspace.updated_at,
    }


def create_export_request(db: sqlite3.Connection, project_id: str, payload: ExportRequestPayload) -> ExportRecord:
    workspace = get_workspace(db, project_id)
    created_at = now_iso()
    snapshot = _workspace_snapshot(workspace)
    options = payload.model_dump(by_alias=True)

    if payload.mode == "frontend_glb":
        status_value = "recorded"
        message = FRONTEND_EXPORT_MESSAGE
        worker_job = None
    elif payload.mode in {"server_glb", "blender_worker"}:
        status_value = "unsupported"
        message = UNSUPPORTED_EXPORT_MESSAGE
        worker_job = {
            "type": "blender_export",
            "status": "not_configured",
            "reason": "Blender worker is not part of the MVP backend yet.",
        }
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported export mode.")

    record = ExportRecord(
        id=f"export_{uuid4().hex}",
        projectId=project_id,
        modelId=workspace.model_id,
        currentVariantId=workspace.current_variant_id,
        status=status_value,
        mode=payload.mode,
        options=options,
        message=message,
        createdAt=created_at,
        workerJob=worker_job,
        workspaceSnapshot=snapshot if payload.include_scene_snapshot else None,
    )

    db.execute(
        """
        INSERT INTO export_requests (
          id,
          project_id,
          model_id,
          current_variant_id,
          status,
          mode,
          options_json,
          workspace_snapshot_json,
          message,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            record.id,
            record.project_id,
            record.model_id,
            record.current_variant_id,
            record.status,
            record.mode,
            json.dumps(record.options),
            json.dumps(snapshot),
            record.message,
            record.created_at,
        ),
    )
    db.commit()

    return record
