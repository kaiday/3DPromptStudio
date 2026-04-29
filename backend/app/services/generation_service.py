import json
import sqlite3
from uuid import uuid4

from fastapi import HTTPException, status

from app.core.config import get_settings
from app.schemas.generation import (
    GenerationJobCreate,
    GenerationJobRecord,
    GenerationJobStatus,
    GenerationProvider,
    now_iso,
)
from app.services.generated_asset_service import build_fake_generation_metadata
from app.services.generation_event_service import create_generation_event

TERMINAL_STATUSES: set[GenerationJobStatus] = {"succeeded", "failed", "canceled"}
SUPPORTED_PROVIDERS: set[str] = {"fake", "openai_blender", "hosted_blender"}


def _generation_provider() -> str:
    settings = get_settings()
    return getattr(settings, "generation_provider", "fake")


def _row_to_generation_job(row: sqlite3.Row) -> GenerationJobRecord:
    return GenerationJobRecord(
        id=row["id"],
        projectId=row["project_id"],
        prompt=row["prompt"],
        status=row["status"],
        provider=row["provider"],
        placement=json.loads(row["placement_json"]),
        style=row["style"],
        mode=row["mode"],
        metadata=json.loads(row["metadata_json"]),
        assetId=row["asset_id"],
        modelUrl=row["model_url"],
        metadataUrl=row["metadata_url"],
        errorMessage=row["error_message"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        completedAt=row["completed_at"],
    )


def _insert_generation_job(
    db: sqlite3.Connection,
    project_id: str,
    payload: GenerationJobCreate,
    provider: str,
) -> GenerationJobRecord:
    created_at = now_iso()
    job = GenerationJobRecord(
        id=f"gen_{uuid4().hex[:12]}",
        projectId=project_id,
        prompt=payload.prompt,
        status="queued",
        provider=provider,
        placement=payload.placement,
        style=payload.style,
        mode=payload.mode,
        metadata=payload.metadata,
        createdAt=created_at,
        updatedAt=created_at,
    )

    db.execute(
        """
        INSERT INTO generation_jobs (
          id,
          project_id,
          prompt,
          status,
          provider,
          placement_json,
          style,
          mode,
          metadata_json,
          asset_id,
          model_url,
          metadata_url,
          error_message,
          created_at,
          updated_at,
          completed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            job.id,
            job.project_id,
            job.prompt,
            job.status,
            job.provider,
            json.dumps(job.placement.model_dump(by_alias=True)),
            job.style,
            job.mode,
            json.dumps(job.metadata),
            job.asset_id,
            job.model_url,
            job.metadata_url,
            job.error_message,
            job.created_at,
            job.updated_at,
            job.completed_at,
        ),
    )
    db.commit()
    return job


def _update_job_status(
    db: sqlite3.Connection,
    job: GenerationJobRecord,
    status_value: GenerationJobStatus,
    *,
    asset_id: str | None = None,
    model_url: str | None = None,
    metadata_url: str | None = None,
    error_message: str | None = None,
) -> GenerationJobRecord:
    updated_at = now_iso()
    completed_at = updated_at if status_value in TERMINAL_STATUSES else None
    db.execute(
        """
        UPDATE generation_jobs
        SET status = ?,
            asset_id = ?,
            model_url = ?,
            metadata_url = ?,
            error_message = ?,
            updated_at = ?,
            completed_at = ?
        WHERE id = ? AND project_id = ?
        """,
        (
            status_value,
            asset_id,
            model_url,
            metadata_url,
            error_message,
            updated_at,
            completed_at,
            job.id,
            job.project_id,
        ),
    )
    db.commit()
    return get_generation_job(db, job.project_id, job.id)


def _run_fake_provider(
    db: sqlite3.Connection,
    job: GenerationJobRecord,
    payload: GenerationJobCreate,
) -> GenerationJobRecord:
    job = _update_job_status(db, job, "running")
    create_generation_event(db, job.id, job.project_id, "job_started", "Fake generation started")
    progress_messages = [
        "Preparing generation workspace",
        "Building placeholder asset metadata",
        "Finalizing fake generation result",
    ]
    for message in progress_messages:
        create_generation_event(db, job.id, job.project_id, "job_progress", message)

    metadata = build_fake_generation_metadata(payload)
    job = _update_job_status(db, job, "succeeded")
    create_generation_event(
        db,
        job.id,
        job.project_id,
        "job_succeeded",
        "Fake generation completed",
        {"assetId": None, "modelUrl": None, "metadata": metadata},
    )
    return job


def _fail_not_implemented_provider(db: sqlite3.Connection, job: GenerationJobRecord) -> GenerationJobRecord:
    message = f"Generation provider '{job.provider}' is not implemented yet."
    job = _update_job_status(db, job, "failed", error_message=message)
    create_generation_event(db, job.id, job.project_id, "job_failed", message, {"provider": job.provider})
    return job


def create_generation_job(
    db: sqlite3.Connection,
    project_id: str,
    payload: GenerationJobCreate,
    provider: GenerationProvider | str | None = None,
) -> GenerationJobRecord:
    provider_name = provider or _generation_provider()
    job = _insert_generation_job(db, project_id, payload, provider_name)
    create_generation_event(db, job.id, project_id, "job_queued", "Generation job queued", {"provider": provider_name})

    if provider_name not in SUPPORTED_PROVIDERS:
        message = f"Unknown generation provider: {provider_name}."
        job = _update_job_status(db, job, "failed", error_message=message)
        create_generation_event(db, job.id, project_id, "job_failed", message, {"provider": provider_name})
        return job
    if provider_name == "fake":
        return _run_fake_provider(db, job, payload)
    return _fail_not_implemented_provider(db, job)


def list_generation_jobs(db: sqlite3.Connection, project_id: str) -> list[GenerationJobRecord]:
    rows = db.execute(
        """
        SELECT *
        FROM generation_jobs
        WHERE project_id = ?
        ORDER BY created_at DESC, id DESC
        """,
        (project_id,),
    ).fetchall()
    return [_row_to_generation_job(row) for row in rows]


def get_generation_job(db: sqlite3.Connection, project_id: str, job_id: str) -> GenerationJobRecord:
    row = db.execute(
        "SELECT * FROM generation_jobs WHERE project_id = ? AND id = ?",
        (project_id, job_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown generation job: {job_id}.")
    return _row_to_generation_job(row)


def cancel_generation_job(db: sqlite3.Connection, project_id: str, job_id: str) -> GenerationJobRecord:
    job = get_generation_job(db, project_id, job_id)
    if job.status in TERMINAL_STATUSES:
        return job

    job = _update_job_status(db, job, "canceled")
    create_generation_event(db, job.id, project_id, "job_canceled", "Generation job canceled")
    return job
