import json
import sqlite3
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.schemas.annotations import AnnotationCreate, AnnotationPatch, AnnotationRecord, now_iso


def _json_or_none(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value)


def _load_json(value: str | None, default: Any = None) -> Any:
    if value is None:
        return default
    return json.loads(value)


def _row_to_annotation(row: sqlite3.Row) -> AnnotationRecord:
    return AnnotationRecord(
        id=row["id"],
        projectId=row["project_id"],
        variantId=row["variant_id"],
        partId=row["part_id"],
        type=row["type"],
        targetType=row["target_type"],
        position=_load_json(row["position_json"]),
        normal=_load_json(row["normal_json"]),
        screenPosition=_load_json(row["screen_position_json"]),
        points=_load_json(row["points_json"], []),
        screenPoints=_load_json(row["screen_points_json"], []),
        cutPlane=_load_json(row["cut_plane_json"]),
        label=row["label"],
        note=row["note"],
        authorId=row["author_id"],
        sessionId=row["session_id"],
        status=row["status"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


def _insert_annotation(db: sqlite3.Connection, annotation: AnnotationRecord) -> AnnotationRecord:
    db.execute(
        """
        INSERT INTO annotations (
          id,
          project_id,
          variant_id,
          part_id,
          type,
          target_type,
          position_json,
          normal_json,
          screen_position_json,
          points_json,
          screen_points_json,
          cut_plane_json,
          label,
          note,
          author_id,
          session_id,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            annotation.id,
            annotation.project_id,
            annotation.variant_id,
            annotation.part_id,
            annotation.type,
            annotation.target_type,
            _json_or_none(annotation.position),
            _json_or_none(annotation.normal),
            _json_or_none(annotation.screen_position.model_dump() if annotation.screen_position else None),
            json.dumps(annotation.points),
            json.dumps([point.model_dump() for point in annotation.screen_points]),
            _json_or_none(annotation.cut_plane.model_dump() if annotation.cut_plane else None),
            annotation.label,
            annotation.note,
            annotation.author_id,
            annotation.session_id,
            annotation.status,
            annotation.created_at,
            annotation.updated_at,
        ),
    )
    db.commit()
    return annotation


def list_annotations(
    db: sqlite3.Connection,
    project_id: str,
    *,
    status_filter: str | None = None,
    part_id: str | None = None,
    variant_id: str | None = None,
    annotation_type: str | None = None,
) -> list[AnnotationRecord]:
    clauses = ["project_id = ?"]
    params: list[Any] = [project_id]

    if status_filter:
        clauses.append("status = ?")
        params.append(status_filter)
    if part_id:
        clauses.append("part_id = ?")
        params.append(part_id)
    if variant_id:
        clauses.append("variant_id = ?")
        params.append(variant_id)
    if annotation_type:
        clauses.append("type = ?")
        params.append(annotation_type)

    rows = db.execute(
        f"SELECT * FROM annotations WHERE {' AND '.join(clauses)} ORDER BY created_at ASC, id ASC",
        params,
    ).fetchall()
    return [_row_to_annotation(row) for row in rows]


def create_annotation(db: sqlite3.Connection, project_id: str, payload: AnnotationCreate) -> AnnotationRecord:
    created_at = now_iso()
    annotation = AnnotationRecord(
        **payload.model_dump(by_alias=True, exclude={"id"}),
        id=payload.id or f"anno_{uuid4().hex}",
        projectId=project_id,
        createdAt=created_at,
        updatedAt=created_at,
    )
    return _insert_annotation(db, annotation)


def get_annotation(db: sqlite3.Connection, project_id: str, annotation_id: str) -> AnnotationRecord:
    row = db.execute(
        "SELECT * FROM annotations WHERE project_id = ? AND id = ?",
        (project_id, annotation_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown annotation: {annotation_id}.")
    return _row_to_annotation(row)


def update_annotation(db: sqlite3.Connection, project_id: str, annotation_id: str, patch: AnnotationPatch) -> AnnotationRecord:
    current = get_annotation(db, project_id, annotation_id)
    current_data = current.model_dump(by_alias=True)
    patch_data = patch.model_dump(by_alias=True, exclude_unset=True)
    merged = {
        **current_data,
        **patch_data,
        "id": current.id,
        "projectId": current.project_id,
        "createdAt": current.created_at,
        "updatedAt": now_iso(),
    }
    updated = AnnotationRecord.model_validate(merged)

    db.execute(
        """
        UPDATE annotations
        SET
          variant_id = ?,
          part_id = ?,
          type = ?,
          target_type = ?,
          position_json = ?,
          normal_json = ?,
          screen_position_json = ?,
          points_json = ?,
          screen_points_json = ?,
          cut_plane_json = ?,
          label = ?,
          note = ?,
          author_id = ?,
          session_id = ?,
          status = ?,
          updated_at = ?
        WHERE project_id = ? AND id = ?
        """,
        (
            updated.variant_id,
            updated.part_id,
            updated.type,
            updated.target_type,
            _json_or_none(updated.position),
            _json_or_none(updated.normal),
            _json_or_none(updated.screen_position.model_dump() if updated.screen_position else None),
            json.dumps(updated.points),
            json.dumps([point.model_dump() for point in updated.screen_points]),
            _json_or_none(updated.cut_plane.model_dump() if updated.cut_plane else None),
            updated.label,
            updated.note,
            updated.author_id,
            updated.session_id,
            updated.status,
            updated.updated_at,
            project_id,
            annotation_id,
        ),
    )
    db.commit()
    return updated


def delete_annotation(db: sqlite3.Connection, project_id: str, annotation_id: str) -> AnnotationRecord:
    current = get_annotation(db, project_id, annotation_id)
    db.execute(
        "DELETE FROM annotations WHERE project_id = ? AND id = ?",
        (project_id, annotation_id),
    )
    db.commit()
    return current
