from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def unique_project_id() -> str:
    return f"project_{uuid4().hex}"


def seed_registry(client: TestClient, project_id: str, *, selected_allowed=True):
    allowed = ["setColor", "setVisibility", "setMaterial"] if selected_allowed else ["setVisibility"]
    response = client.put(
        f"/api/projects/{project_id}/components",
        json={
            "modelId": "model_cat",
            "components": [
                {
                    "id": "hat_red_band",
                    "name": "Hat Red Band",
                    "meshName": "hat_red_band",
                    "materialName": "hat_red_fabric",
                    "editable": True,
                    "allowedOperations": allowed,
                },
                {
                    "id": "front_left_leg",
                    "name": "Front Left Leg",
                    "meshName": "front_left_leg",
                    "materialName": "wood",
                    "editable": True,
                    "allowedOperations": ["setColor", "setVisibility"],
                },
                {
                    "id": "front_right_leg",
                    "name": "Front Right Leg",
                    "meshName": "front_right_leg",
                    "materialName": "wood",
                    "editable": True,
                    "allowedOperations": ["setColor", "setVisibility"],
                },
            ],
        },
    )
    assert response.status_code == 200


def seed_workspace(client: TestClient, project_id: str, selected_part_id: str = "hat_red_band"):
    response = client.patch(
        f"/api/projects/{project_id}/workspace",
        json={
            "selectedPartId": selected_part_id,
            "scene": {
                "components": [
                    {"id": "hat_red_band", "name": "Hat Red Band", "material": {"color": "#cc3333"}, "transform": {}},
                    {"id": "front_left_leg", "name": "Front Left Leg", "material": {"color": "#aaaaaa"}, "transform": {}},
                    {"id": "front_right_leg", "name": "Front Right Leg", "material": {"color": "#aaaaaa"}, "transform": {}},
                ]
            },
        },
    )
    assert response.status_code == 200


def test_prompt_edits_selected_part_through_operations_service():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)
    seed_workspace(client, project_id)

    response = client.post(
        f"/api/projects/{project_id}/prompt",
        json={"prompt": "make this part blue"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["operations"][0]["op"] == "setColor"
    assert payload["operations"][0]["targetId"] == "hat_red_band"
    assert payload["workspace"]["scene"]["components"][0]["material"]["color"] == "#3b82f6"
    assert payload["promptContext"]["selectedPartId"] == "hat_red_band"


def test_prompt_can_target_grouped_legs():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)
    seed_workspace(client, project_id)

    response = client.post(
        f"/api/projects/{project_id}/prompt",
        json={"prompt": "make the legs black"},
    )

    assert response.status_code == 200
    operations = response.json()["operations"]
    assert {operation["targetId"] for operation in operations} == {"front_left_leg", "front_right_leg"}
    scene_components = {
        component["id"]: component
        for component in response.json()["workspace"]["scene"]["components"]
    }
    assert scene_components["front_left_leg"]["material"]["color"] == "#111827"
    assert scene_components["front_right_leg"]["material"]["color"] == "#111827"


def test_prompt_cannot_bypass_operation_validation():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id, selected_allowed=False)
    seed_workspace(client, project_id)

    response = client.post(
        f"/api/projects/{project_id}/prompt",
        json={"prompt": "make this part blue"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Component hat_red_band does not allow setColor operations."
