from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def unique_project_id() -> str:
    return f"project_{uuid4().hex}"


def test_frontend_glb_export_records_current_variant_without_mutating_workspace():
    client = TestClient(app)
    project_id = unique_project_id()

    patch_response = client.patch(
        f"/api/projects/{project_id}/workspace",
        json={
            "modelId": "model_demo",
            "currentVariantId": "variant_blue",
            "scene": {
                "components": [
                    {
                        "id": "seat",
                        "name": "Seat",
                        "visible": True,
                        "material": {"color": "#2563eb", "type": "standard"},
                    }
                ]
            },
            "hasUnsavedOperations": True,
        },
    )
    assert patch_response.status_code == 200
    before_workspace = patch_response.json()["workspace"]

    response = client.post(
        f"/api/projects/{project_id}/export",
        json={"mode": "frontend_glb", "includeAnnotations": True, "filename": "chair-blue.glb"},
    )

    assert response.status_code == 200
    export = response.json()["export"]
    assert export["id"].startswith("export_")
    assert export["projectId"] == project_id
    assert export["modelId"] == "model_demo"
    assert export["currentVariantId"] == "variant_blue"
    assert export["status"] == "recorded"
    assert export["mode"] == "frontend_glb"
    assert export["options"]["includeAnnotations"] is True
    assert export["options"]["format"] == "glb"
    assert export["workerJob"] is None
    assert export["workspaceSnapshot"]["scene"]["components"][0]["id"] == "seat"
    assert "client-side" in export["message"]

    after_response = client.get(f"/api/projects/{project_id}/workspace")
    assert after_response.status_code == 200
    after_workspace = after_response.json()["workspace"]
    assert after_workspace["scene"] == before_workspace["scene"]
    assert after_workspace["currentVariantId"] == before_workspace["currentVariantId"]
    assert after_workspace["history"] == before_workspace["history"]


def test_export_can_omit_workspace_snapshot():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.post(
        f"/api/projects/{project_id}/export",
        json={"mode": "frontend_glb", "includeSceneSnapshot": False},
    )

    assert response.status_code == 200
    export = response.json()["export"]
    assert export["status"] == "recorded"
    assert export["workspaceSnapshot"] is None


def test_server_export_mode_is_recorded_as_future_worker_contract():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.post(
        f"/api/projects/{project_id}/export",
        json={"mode": "blender_worker"},
    )

    assert response.status_code == 200
    export = response.json()["export"]
    assert export["status"] == "unsupported"
    assert export["mode"] == "blender_worker"
    assert export["workerJob"]["type"] == "blender_export"
    assert export["workerJob"]["status"] == "not_configured"
    assert "Blender worker" in export["message"]
