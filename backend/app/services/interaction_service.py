import json
import sqlite3
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.schemas.interactions import ComponentInteraction, ComponentInteractionsPayload, now_iso


def _load_payload(value: str) -> dict[str, Any]:
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def _row_to_interaction(row: sqlite3.Row) -> ComponentInteraction:
    return ComponentInteraction(
        id=row["id"],
        projectId=row["project_id"],
        componentId=row["component_id"],
        kind=row["kind"],
        label=row["label"],
        payload=_load_payload(row["payload_json"]),
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


def list_component_interactions(
    db: sqlite3.Connection,
    project_id: str,
    component_id: str,
) -> list[ComponentInteraction]:
    rows = db.execute(
        """
        SELECT *
        FROM component_interactions
        WHERE project_id = ? AND component_id = ?
        ORDER BY created_at ASC, id ASC
        """,
        (project_id, component_id),
    ).fetchall()
    return [_row_to_interaction(row) for row in rows]


def replace_component_interactions(
    db: sqlite3.Connection,
    project_id: str,
    component_id: str,
    payload: ComponentInteractionsPayload,
) -> list[ComponentInteraction]:
    existing_rows = db.execute(
        """
        SELECT id, created_at
        FROM component_interactions
        WHERE project_id = ? AND component_id = ?
        """,
        (project_id, component_id),
    ).fetchall()
    existing_created_at = {row["id"]: row["created_at"] for row in existing_rows}

    updated_at = now_iso()
    records: list[ComponentInteraction] = []
    for interaction in payload.interactions:
        interaction_id = interaction.id or f"interaction_{uuid4().hex}"
        records.append(
            ComponentInteraction(
                id=interaction_id,
                projectId=project_id,
                componentId=component_id,
                kind=interaction.kind,
                label=interaction.label,
                payload=interaction.payload,
                createdAt=existing_created_at.get(interaction_id, interaction.created_at or updated_at),
                updatedAt=updated_at,
            )
        )

    db.execute(
        "DELETE FROM component_interactions WHERE project_id = ? AND component_id = ?",
        (project_id, component_id),
    )
    db.executemany(
        """
        INSERT INTO component_interactions (
          id,
          project_id,
          component_id,
          kind,
          label,
          payload_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                record.id,
                record.project_id,
                record.component_id,
                record.kind,
                record.label,
                json.dumps(record.payload),
                record.created_at,
                record.updated_at,
            )
            for record in records
        ],
    )
    db.commit()
    return list_component_interactions(db, project_id, component_id)


def delete_component_interaction(
    db: sqlite3.Connection,
    project_id: str,
    component_id: str,
    interaction_id: str,
) -> ComponentInteraction:
    row = db.execute(
        """
        SELECT *
        FROM component_interactions
        WHERE project_id = ? AND component_id = ? AND id = ?
        """,
        (project_id, component_id, interaction_id),
    ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown component interaction: {interaction_id}.",
        )

    interaction = _row_to_interaction(row)
    db.execute(
        """
        DELETE FROM component_interactions
        WHERE project_id = ? AND component_id = ? AND id = ?
        """,
        (project_id, component_id, interaction_id),
    )
    db.commit()
    return interaction
