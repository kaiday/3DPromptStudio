import json
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import app
from app.schemas.generation import GenerationJobCreate, now_iso
from app.services.generation_service import create_generation_job


def unique_project_id() -> str:
    return f"project_{uuid4().hex}"


def test_create_generation_job_succeeds_with_fake_provider():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.post(
        f"/api/projects/{project_id}/generation/jobs",
        json={
            "prompt": "spawn an old wizard",
            "placement": {"position": [1, 0, 2], "rotation": [0, 0.5, 0], "scale": 1.25},
            "style": "low-poly educational",
            "metadata": {"role": "npc", "dialogue": ["Hello, traveler."]},
        },
    )

    assert response.status_code == 200
    job = response.json()["job"]
    assert job["id"].startswith("gen_")
    assert job["projectId"] == project_id
    assert job["prompt"] == "spawn an old wizard"
    assert job["status"] == "succeeded"
    assert job["provider"] == "fake"
    assert job["placement"]["position"] == [1.0, 0.0, 2.0]
    assert job["placement"]["rotation"] == [0.0, 0.5, 0.0]
    assert job["placement"]["scale"] == 1.25
    assert job["style"] == "low-poly educational"
    assert job["metadata"]["role"] == "npc"
    assert job["assetId"] is None
    assert job["modelUrl"] is None
    assert job["completedAt"] is not None


def test_list_and_read_generation_jobs_by_project():
    client = TestClient(app)
    project_id = unique_project_id()

    create_response = client.post(
        f"/api/projects/{project_id}/generation/jobs",
        json={"prompt": "spawn a blue robot"},
    )
    assert create_response.status_code == 200
    created = create_response.json()["job"]

    list_response = client.get(f"/api/projects/{project_id}/generation/jobs")
    assert list_response.status_code == 200
    jobs = list_response.json()["jobs"]
    assert [job["id"] for job in jobs] == [created["id"]]

    read_response = client.get(f"/api/projects/{project_id}/generation/jobs/{created['id']}")
    assert read_response.status_code == 200
    assert read_response.json()["job"]["id"] == created["id"]


def test_cancel_queued_generation_job_changes_status_and_emits_event():
    client = TestClient(app)
    project_id = unique_project_id()
    job_id = f"gen_{uuid4().hex[:12]}"
    created_at = now_iso()

    db_gen = get_db()
    db = next(db_gen)
    try:
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
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                project_id,
                "spawn a pending robot",
                "queued",
                "fake",
                json.dumps({"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": 1}),
                None,
                "asset",
                "{}",
                created_at,
                created_at,
            ),
        )
        db.commit()
    finally:
        db_gen.close()

    response = client.delete(f"/api/projects/{project_id}/generation/jobs/{job_id}")
    assert response.status_code == 200
    job = response.json()["job"]
    assert job["status"] == "canceled"
    assert job["completedAt"] is not None

    events_response = client.get(f"/api/projects/{project_id}/generation/jobs/{job_id}/events")
    assert events_response.status_code == 200
    assert [event["type"] for event in events_response.json()["events"]] == ["job_canceled"]


def test_invalid_generation_placement_is_rejected():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.post(
        f"/api/projects/{project_id}/generation/jobs",
        json={
            "prompt": "spawn a broken placement",
            "placement": {"position": [0, 0], "rotation": [0, 0, 0], "scale": 1},
        },
    )

    assert response.status_code == 422


def test_unknown_generation_provider_fails_clearly():
    db_gen = get_db()
    db = next(db_gen)
    try:
        project_id = unique_project_id()
        job = create_generation_job(
            db,
            project_id,
            GenerationJobCreate(prompt="spawn a test object"),
            provider="unknown_provider",
        )
    finally:
        db_gen.close()

    assert job.status == "failed"
    assert job.error_message == "Unknown generation provider: unknown_provider."


def test_not_implemented_generation_provider_fails_clearly():
    db_gen = get_db()
    db = next(db_gen)
    try:
        project_id = unique_project_id()
        job = create_generation_job(
            db,
            project_id,
            GenerationJobCreate(prompt="spawn a Blender object"),
            provider="openai_blender",
        )
    finally:
        db_gen.close()

    assert job.status == "failed"
    assert job.error_message == "Generation provider 'openai_blender' is not implemented yet."
