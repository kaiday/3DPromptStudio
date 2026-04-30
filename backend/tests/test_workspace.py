from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def unique_project_id() -> str:
    return f"project_{uuid4().hex}"


def test_workspace_load_patch_undo_redo():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.get(f"/api/projects/{project_id}/workspace")
    assert response.status_code == 200
    workspace = response.json()["workspace"]
    assert workspace["projectId"] == project_id
    assert workspace["selectedTool"] == "mouse"
    assert workspace["workspaceMode"] == "edit"
    assert workspace["rightPanelMode"] == "config"
    assert workspace["viewport"]["cameraPosition"] == [3.0, 2.2, 4.0]

    response = client.patch(
        f"/api/projects/{project_id}/workspace",
        json={
            "selectedTool": "annotation",
            "selectedPartId": "seat",
            "workspaceMode": "maker",
            "rightPanelMode": "prompt",
            "viewport": {
                "zoom": 1.5,
                "visibleHelpers": {"grid": False},
            },
        },
    )
    assert response.status_code == 200
    patched = response.json()["workspace"]
    assert patched["selectedTool"] == "annotation"
    assert patched["selectedPartId"] == "seat"
    assert patched["workspaceMode"] == "maker"
    assert patched["rightPanelMode"] == "prompt"
    assert patched["viewport"]["zoom"] == 1.5
    assert patched["viewport"]["visibleHelpers"]["grid"] is False
    assert patched["history"]["past"]

    response = client.post(f"/api/projects/{project_id}/workspace/undo")
    assert response.status_code == 200
    undone = response.json()["workspace"]
    assert undone["selectedTool"] == "mouse"
    assert undone["selectedPartId"] is None
    assert undone["workspaceMode"] == "edit"
    assert undone["history"]["future"]

    response = client.post(f"/api/projects/{project_id}/workspace/redo")
    assert response.status_code == 200
    redone = response.json()["workspace"]
    assert redone["selectedTool"] == "annotation"
    assert redone["selectedPartId"] == "seat"
    assert redone["workspaceMode"] == "maker"


def test_workspace_patch_rejects_invalid_tool():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.patch(
        f"/api/projects/{project_id}/workspace",
        json={"selectedTool": "paint"},
    )

    assert response.status_code == 422


def test_workspace_patch_rejects_invalid_workspace_mode():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.patch(
        f"/api/projects/{project_id}/workspace",
        json={"workspaceMode": "inspect"},
    )

    assert response.status_code == 422
