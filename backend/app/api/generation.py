import sqlite3

from fastapi import APIRouter, Depends

from app.db.session import get_db
from app.schemas.generation import (
    GenerationEventsResponse,
    GenerationJobCreate,
    GenerationJobResponse,
    GenerationJobsResponse,
)
from app.services.generation_event_service import list_generation_events
from app.services.generation_service import (
    cancel_generation_job,
    create_generation_job,
    get_generation_job,
    list_generation_jobs,
)

router = APIRouter(prefix="/projects/{project_id}/generation", tags=["generation"])


@router.post("/jobs")
def post_generation_job(
    project_id: str,
    payload: GenerationJobCreate,
    db: sqlite3.Connection = Depends(get_db),
) -> GenerationJobResponse:
    job = create_generation_job(db, project_id, payload)
    return GenerationJobResponse(job=job)


@router.get("/jobs")
def get_generation_jobs(
    project_id: str,
    db: sqlite3.Connection = Depends(get_db),
) -> GenerationJobsResponse:
    jobs = list_generation_jobs(db, project_id)
    return GenerationJobsResponse(jobs=jobs)


@router.get("/jobs/{job_id}")
def get_generation_job_by_id(
    project_id: str,
    job_id: str,
    db: sqlite3.Connection = Depends(get_db),
) -> GenerationJobResponse:
    job = get_generation_job(db, project_id, job_id)
    return GenerationJobResponse(job=job)


@router.get("/jobs/{job_id}/events")
def get_generation_job_events(
    project_id: str,
    job_id: str,
    db: sqlite3.Connection = Depends(get_db),
) -> GenerationEventsResponse:
    get_generation_job(db, project_id, job_id)
    events = list_generation_events(db, project_id, job_id)
    return GenerationEventsResponse(events=events)


@router.delete("/jobs/{job_id}")
def delete_generation_job(
    project_id: str,
    job_id: str,
    db: sqlite3.Connection = Depends(get_db),
) -> GenerationJobResponse:
    job = cancel_generation_job(db, project_id, job_id)
    return GenerationJobResponse(job=job)
