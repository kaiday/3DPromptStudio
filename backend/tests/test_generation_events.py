from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def unique_project_id() -> str:
    return f"project_{uuid4().hex}"


def test_fake_provider_emits_persisted_events_in_order():
    client = TestClient(app)
    project_id = unique_project_id()

    create_response = client.post(
        f"/api/projects/{project_id}/generation/jobs",
        json={"prompt": "spawn a friendly test robot"},
    )
    assert create_response.status_code == 200
    job = create_response.json()["job"]

    events_response = client.get(f"/api/projects/{project_id}/generation/jobs/{job['id']}/events")
    assert events_response.status_code == 200
    events = events_response.json()["events"]

    assert [event["type"] for event in events] == [
        "job_queued",
        "job_started",
        "job_progress",
        "job_progress",
        "job_progress",
        "job_succeeded",
    ]
    assert events[0]["payload"]["provider"] == "fake"
    assert events[-1]["payload"]["assetId"] is None
    assert events[-1]["payload"]["modelUrl"] is None
    assert events[-1]["payload"]["metadata"]["placeholder"] is True


def test_generation_events_for_unknown_job_return_404():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.get(f"/api/projects/{project_id}/generation/jobs/gen_missing/events")

    assert response.status_code == 404
