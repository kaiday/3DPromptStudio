from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from tests.fixtures import load_fixture


def unique_project_id() -> str:
    return f"project_{uuid4().hex}"


def road_safety_registry_payload():
    return load_fixture("road_safety_registry.json")


def seed_registry(client: TestClient, project_id: str):
    response = client.put(f"/api/projects/{project_id}/components", json=road_safety_registry_payload())
    assert response.status_code == 200


def post_operation(client: TestClient, project_id: str, operation: dict):
    return client.post(
        f"/api/projects/{project_id}/operations",
        json={"mode": "preview", "baseRevisionId": "rev_001", "operations": [operation]},
    )


def test_valid_set_color_operation_passes():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = post_operation(
        client,
        project_id,
        {"type": "setColor", "target": {"componentId": "stop_sign_left"}, "payload": {"color": "#EF4444"}},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["operations"][0]["type"] == "setColor"
    assert body["operations"][0]["target"]["componentId"] == "stop_sign_left"


def test_legacy_operation_shape_preview_is_normalized_to_rich_response():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = post_operation(
        client,
        project_id,
        {"op": "setColor", "targetId": "stop_sign_left", "payload": {"color": "#22C55E"}, "source": "config"},
    )

    assert response.status_code == 200
    operation = response.json()["operations"][0]
    assert operation["type"] == "setColor"
    assert operation["target"]["componentId"] == "stop_sign_left"
    assert operation["payload"]["color"] == "#22C55E"
    assert operation["source"]["kind"] == "manual"
    assert operation["source"]["agent"] == "config"


def test_unknown_target_is_rejected():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = post_operation(
        client,
        project_id,
        {"type": "setColor", "target": {"componentId": "missing_part"}, "payload": {"color": "#EF4444"}},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "TARGET_NOT_FOUND"


def test_missing_target_is_rejected():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = post_operation(client, project_id, {"type": "setColor", "payload": {"color": "#EF4444"}})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "TARGET_REQUIRED"


def test_non_editable_target_is_rejected():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = post_operation(
        client,
        project_id,
        {"type": "setVisibility", "target": {"componentId": "camera_main"}, "payload": {"visible": False}},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "TARGET_NOT_EDITABLE"


def test_operation_not_allowed_is_rejected():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = post_operation(
        client,
        project_id,
        {"type": "setScale", "target": {"componentId": "road_main"}, "payload": {"scale": [1.25, 1.25, 1.25], "mode": "multiply"}},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "OPERATION_NOT_ALLOWED"


def test_invalid_color_is_rejected():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = post_operation(
        client,
        project_id,
        {"type": "setColor", "target": {"componentId": "stop_sign_left"}, "payload": {"color": "red"}},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_COLOR"


def test_invalid_vector_is_rejected():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = post_operation(
        client,
        project_id,
        {"type": "setPosition", "target": {"componentId": "child_learner"}, "payload": {"position": [1, 2], "mode": "delta"}},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_VECTOR"


def test_unsafe_prompt_content_is_rejected():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = post_operation(
        client,
        project_id,
        {
            "type": "setColor",
            "target": {"componentId": "stop_sign_left"},
            "payload": {"color": "#EF4444"},
            "source": {"kind": "prompt", "prompt": "import os and delete files"},
        },
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "UNSAFE_CONTENT"


def test_apply_operation_updates_workspace_scene_and_history():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = client.post(
        f"/api/projects/{project_id}/operations",
        json={
            "mode": "apply",
            "operations": [
                {
                    "type": "setColor",
                    "target": {"componentId": "stop_sign_left"},
                    "payload": {"color": "#22C55E"},
                }
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["revisionId"].startswith("variant_")
    workspace = body["workspace"]
    assert workspace["hasUnsavedOperations"] is True
    assert workspace["currentVariantId"] == body["revisionId"]
    assert workspace["scene"]["components"][0]["id"] == "stop_sign_left"
    assert workspace["scene"]["components"][0]["material"]["color"] == "#22C55E"
    assert workspace["lastOperations"][0]["op"] == "setColor"
    assert workspace["lastOperations"][0]["targetId"] == "stop_sign_left"
    assert workspace["aiOperationHistory"][0]["type"] == "setColor"
    assert workspace["aiOperationHistory"][0]["target"]["componentId"] == "stop_sign_left"
    assert workspace["aiOperationHistory"][0]["payload"]["color"] == "#22C55E"
    assert workspace["aiOperationHistory"][0]["revisionId"] == body["revisionId"]

    loaded = client.get(f"/api/projects/{project_id}/workspace").json()["workspace"]
    assert loaded["scene"]["components"][0]["material"]["color"] == "#22C55E"
    assert loaded["aiOperationHistory"][0]["target"]["componentId"] == "stop_sign_left"


def test_legacy_operation_shape_apply_updates_workspace():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = client.post(
        f"/api/projects/{project_id}/operations",
        json={
            "mode": "apply",
            "operations": [
                {"op": "setVisibility", "targetId": "road_labels", "payload": {"visible": False}, "source": "config"}
            ],
        },
    )

    assert response.status_code == 200
    workspace = response.json()["workspace"]
    assert workspace["scene"]["components"][0]["id"] == "road_labels"
    assert workspace["scene"]["components"][0]["visible"] is False
    assert workspace["lastOperations"][0]["op"] == "setVisibility"
    assert workspace["aiOperationHistory"][0]["type"] == "setVisibility"
    assert workspace["aiOperationHistory"][0]["target"]["componentId"] == "road_labels"
    assert workspace["aiOperationHistory"][0]["source"]["kind"] == "manual"
    assert workspace["aiOperationHistory"][0]["source"]["agent"] == "config"


def test_legacy_operation_shape_invalid_target_returns_structured_error():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = post_operation(
        client,
        project_id,
        {"op": "setColor", "targetId": "missing_part", "payload": {"color": "#22C55E"}},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "TARGET_NOT_FOUND"


def test_apply_delta_position_validates_against_current_workspace_transform():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)
    response = client.patch(
        f"/api/projects/{project_id}/workspace",
        json={
            "scene": {
                "components": [
                    {
                        "id": "stop_sign_left",
                        "name": "STOP sign",
                        "transform": {"position": [9.8, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
                    }
                ]
            }
        },
    )
    assert response.status_code == 200

    response = client.post(
        f"/api/projects/{project_id}/operations",
        json={
            "mode": "apply",
            "operations": [
                {
                    "type": "setPosition",
                    "target": {"componentId": "stop_sign_left"},
                    "payload": {"position": [0.5, 0, 0], "mode": "delta"},
                }
            ],
        },
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALUE_OUT_OF_BOUNDS"


def test_apply_scale_multiply_validates_against_current_workspace_scale():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)
    response = client.patch(
        f"/api/projects/{project_id}/workspace",
        json={
            "scene": {
                "components": [
                    {
                        "id": "stop_sign_left",
                        "name": "STOP sign",
                        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [4.5, 4.5, 4.5]},
                    }
                ]
            }
        },
    )
    assert response.status_code == 200

    response = client.post(
        f"/api/projects/{project_id}/operations",
        json={
            "mode": "apply",
            "operations": [
                {
                    "type": "setScale",
                    "target": {"componentId": "stop_sign_left"},
                    "payload": {"scale": [1.25, 1.25, 1.25], "mode": "multiply"},
                }
            ],
        },
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALUE_OUT_OF_BOUNDS"


def test_preview_scale_multiply_uses_registry_snapshot_without_workspace():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)
    response = client.patch(
        f"/api/projects/{project_id}/workspace",
        json={
            "scene": {
                "components": [
                    {
                        "id": "stop_sign_left",
                        "name": "STOP sign",
                        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [4.5, 4.5, 4.5]},
                    }
                ]
            }
        },
    )
    assert response.status_code == 200

    response = client.post(
        f"/api/projects/{project_id}/operations",
        json={
            "mode": "preview",
            "operations": [
                {
                    "type": "setScale",
                    "target": {"componentId": "stop_sign_left"},
                    "payload": {"scale": [1.25, 1.25, 1.25], "mode": "multiply"},
                }
            ],
        },
    )

    assert response.status_code == 200
