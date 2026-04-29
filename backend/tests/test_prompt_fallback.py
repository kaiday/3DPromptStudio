from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from tests.fixtures import load_fixture


def unique_project_id() -> str:
    return f"project_{uuid4().hex}"


def registry_payload():
    return load_fixture("road_safety_registry.json")


def seed_registry(client: TestClient, project_id: str, payload: dict | None = None):
    response = client.put(f"/api/projects/{project_id}/components", json=payload or registry_payload())
    assert response.status_code == 200


def prompt(client: TestClient, project_id: str, value: str, selected: str | None = None):
    payload = {"prompt": value, "mode": "preview", "baseRevisionId": "rev_001"}
    if selected:
        payload["selectedComponentId"] = selected
    return client.post(f"/api/projects/{project_id}/prompt", json=payload)


def test_prompt_make_stop_sign_red():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = prompt(client, project_id, "make the stop sign red")

    assert response.status_code == 200
    operation = response.json()["operations"][0]
    assert operation["type"] == "setColor"
    assert operation["target"]["componentId"] == "stop_sign_left"
    assert operation["payload"]["color"] == "#EF4444"


def test_prompt_make_selected_bigger():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = prompt(client, project_id, "make this bigger", "stop_sign_left")

    assert response.status_code == 200
    operation = response.json()["operations"][0]
    assert operation["type"] == "setScale"
    assert operation["target"]["componentId"] == "stop_sign_left"
    assert operation["payload"]["scale"] == [1.25, 1.25, 1.25]


def test_prompt_hide_road_labels():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = prompt(client, project_id, "hide the road labels")

    assert response.status_code == 200
    operation = response.json()["operations"][0]
    assert operation["type"] == "setVisibility"
    assert operation["target"]["componentId"] == "road_labels"
    assert operation["payload"]["visible"] is False


def test_prompt_move_child_left():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = prompt(client, project_id, "move the child left")

    assert response.status_code == 200
    operation = response.json()["operations"][0]
    assert operation["type"] == "setPosition"
    assert operation["target"]["componentId"] == "child_learner"
    assert operation["payload"]["position"] == [-0.5, 0, 0]


def test_prompt_rotate_stop_sign_right():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = prompt(client, project_id, "rotate the stop sign right")

    assert response.status_code == 200
    operation = response.json()["operations"][0]
    assert operation["type"] == "setRotation"
    assert operation["target"]["componentId"] == "stop_sign_left"
    assert operation["payload"]["rotation"] == [0, -15, 0]


def test_prompt_ambiguous_target_returns_clarification():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = prompt(client, project_id, "make the sign blue")

    assert response.status_code == 400
    body = response.json()
    assert body["requiresClarification"] is True
    assert body["error"]["code"] == "AMBIGUOUS_TARGET"


def test_prompt_structural_edit_returns_generation_handoff():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = prompt(client, project_id, "add a new school bus")

    assert response.status_code == 400
    body = response.json()
    assert body["requiresGeneration"] is True
    assert body["error"]["code"] == "STRUCTURAL_EDIT_REQUIRES_GENERATION"


def test_prompt_selected_shortcut_requires_selection():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = prompt(client, project_id, "make this green")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "TARGET_REQUIRED"


def test_prompt_make_chair_cushion_blue():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id, load_fixture("chair_registry.json"))

    response = prompt(client, project_id, "make the cushion blue")

    assert response.status_code == 200
    operation = response.json()["operations"][0]
    assert operation["type"] == "setColor"
    assert operation["target"]["componentId"] == "chair_seat"
    assert operation["payload"]["color"] == "#2563EB"


def test_prompt_make_chair_legs_black():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id, load_fixture("chair_registry.json"))

    response = prompt(client, project_id, "make the legs black")

    assert response.status_code == 200
    operation = response.json()["operations"][0]
    assert operation["type"] == "setColor"
    assert operation["target"]["componentId"] == "chair_legs"
    assert operation["payload"]["color"] == "#111827"


def test_prompt_make_hat_band_blue():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id, load_fixture("cat_hat_registry.json"))

    response = prompt(client, project_id, "make the hat band blue")

    assert response.status_code == 200
    operation = response.json()["operations"][0]
    assert operation["type"] == "setColor"
    assert operation["target"]["componentId"] == "hat_red_band"
    assert operation["payload"]["color"] == "#2563EB"


def test_prompt_hide_top_hat():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id, load_fixture("cat_hat_registry.json"))

    response = prompt(client, project_id, "hide the top hat")

    assert response.status_code == 200
    operation = response.json()["operations"][0]
    assert operation["type"] == "setVisibility"
    assert operation["target"]["componentId"] == "hat_top"
    assert operation["payload"]["visible"] is False


def test_prompt_apply_updates_workspace():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    response = client.post(
        f"/api/projects/{project_id}/prompt",
        json={"prompt": "make the stop sign green", "mode": "apply"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["revisionId"].startswith("variant_")
    assert body["operations"][0]["type"] == "setColor"
    workspace = body["workspace"]
    assert workspace["scene"]["components"][0]["id"] == "stop_sign_left"
    assert workspace["scene"]["components"][0]["material"]["color"] == "#22C55E"
    assert workspace["lastOperations"][0]["source"] == "prompt"
    assert workspace["aiOperationHistory"][0]["type"] == "setColor"
    assert workspace["aiOperationHistory"][0]["target"]["componentId"] == "stop_sign_left"
    assert workspace["aiOperationHistory"][0]["source"]["prompt"] == "make the stop sign green"
    assert workspace["aiOperationHistory"][0]["source"]["agent"] == "deterministic_fallback"


def test_prompt_uses_workspace_selected_part_when_request_omits_selection():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id, load_fixture("cat_hat_registry.json"))
    response = client.patch(
        f"/api/projects/{project_id}/workspace",
        json={
            "selectedPartId": "hat_red_band",
            "scene": {
                "components": [
                    {"id": "hat_red_band", "name": "Hat red band", "material": {"color": "#DC2626"}, "transform": {}}
                ]
            },
        },
    )
    assert response.status_code == 200

    response = prompt(client, project_id, "make this blue")

    assert response.status_code == 200
    operation = response.json()["operations"][0]
    assert operation["type"] == "setColor"
    assert operation["target"]["componentId"] == "hat_red_band"
    assert operation["payload"]["color"] == "#2563EB"


def test_prompt_can_target_grouped_legs_with_multiple_operations():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(
        client,
        project_id,
        {
            "modelId": "model_legs",
            "components": [
                {
                    "id": "front_left_leg",
                    "name": "Front left leg",
                    "meshName": "front_left_leg",
                    "editable": True,
                    "allowedOperations": ["setColor", "setVisibility"],
                },
                {
                    "id": "front_right_leg",
                    "name": "Front right leg",
                    "meshName": "front_right_leg",
                    "editable": True,
                    "allowedOperations": ["setColor", "setVisibility"],
                },
                {
                    "id": "seat",
                    "name": "Seat",
                    "meshName": "seat",
                    "editable": True,
                    "allowedOperations": ["setColor"],
                },
            ],
        },
    )

    response = prompt(client, project_id, "make the legs black")

    assert response.status_code == 200
    operations = response.json()["operations"]
    assert {operation["target"]["componentId"] for operation in operations} == {"front_left_leg", "front_right_leg"}
    assert {operation["payload"]["color"] for operation in operations} == {"#111827"}


def test_prompt_grouped_legs_apply_updates_multiple_workspace_components():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(
        client,
        project_id,
        {
            "modelId": "model_legs",
            "components": [
                {
                    "id": "front_left_leg",
                    "name": "Front left leg",
                    "meshName": "front_left_leg",
                    "editable": True,
                    "allowedOperations": ["setColor", "setVisibility"],
                },
                {
                    "id": "front_right_leg",
                    "name": "Front right leg",
                    "meshName": "front_right_leg",
                    "editable": True,
                    "allowedOperations": ["setColor", "setVisibility"],
                },
            ],
        },
    )
    response = client.patch(
        f"/api/projects/{project_id}/workspace",
        json={
            "scene": {
                "components": [
                    {"id": "front_left_leg", "name": "Front left leg", "material": {"color": "#aaaaaa"}, "transform": {}},
                    {"id": "front_right_leg", "name": "Front right leg", "material": {"color": "#aaaaaa"}, "transform": {}},
                ]
            },
        },
    )
    assert response.status_code == 200

    response = client.post(f"/api/projects/{project_id}/prompt", json={"prompt": "make the legs black", "mode": "apply"})

    assert response.status_code == 200
    scene_components = {
        component["id"]: component
        for component in response.json()["workspace"]["scene"]["components"]
    }
    assert scene_components["front_left_leg"]["material"]["color"] == "#111827"
    assert scene_components["front_right_leg"]["material"]["color"] == "#111827"
    assert len(response.json()["workspace"]["aiOperationHistory"]) == 2
