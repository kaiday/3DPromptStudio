import json
import sqlite3
from uuid import uuid4

from app.schemas.generation import GenerationEventRecord, GenerationEventType, now_iso


def _row_to_generation_event(row: sqlite3.Row) -> GenerationEventRecord:
    return GenerationEventRecord(
        id=row["id"],
        jobId=row["job_id"],
        projectId=row["project_id"],
        type=row["type"],
        message=row["message"],
        payload=json.loads(row["payload_json"]),
        createdAt=row["created_at"],
    )


def create_generation_event(
    db: sqlite3.Connection,
    job_id: str,
    project_id: str,
    event_type: GenerationEventType,
    message: str = "",
    payload: dict | None = None,
) -> GenerationEventRecord:
    event = GenerationEventRecord(
        id=f"genevt_{uuid4().hex}",
        jobId=job_id,
        projectId=project_id,
        type=event_type,
        message=message,
        payload=payload or {},
        createdAt=now_iso(),
    )

    db.execute(
        """
        INSERT INTO generation_events (
          id,
          job_id,
          project_id,
          type,
          message,
          payload_json,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event.id,
            event.job_id,
            event.project_id,
            event.type,
            event.message,
            json.dumps(event.payload),
            event.created_at,
        ),
    )
    db.commit()
    return event


def list_generation_events(db: sqlite3.Connection, project_id: str, job_id: str) -> list[GenerationEventRecord]:
    rows = db.execute(
        """
        SELECT *
        FROM generation_events
        WHERE project_id = ? AND job_id = ?
        ORDER BY created_at ASC, id ASC
        """,
        (project_id, job_id),
    ).fetchall()
    return [_row_to_generation_event(row) for row in rows]
