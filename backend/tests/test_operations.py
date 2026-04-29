from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def unique_project_id() -> str:
    return f"project_{uuid4().hex}"


def seed_component_registry(client: TestClient, project_id: str, *, editable: bool = True, operations=None):
    payload = {
        "modelId": "model_cat",
        "components": [
            {
                "id": "hat_red_band",
                "name": "Hat Red Band",
                "meshName": "hat_red_band",
                "materialName": "hat_red_fabric",
                "editable": editable,
                "allowedOperations": operations or ["setColor", "setVisibility", "setScale"],
                "transformBounds": {
                    "position": {"min": [-5, -5, -5], "max": [5, 5, 5]},
                    "scale": {"min": [0.5, 0.5, 0.5], "max": [2, 2, 2]},
                    "rotation": {"min": [-3.14, -3.14, -3.14], "max": [3.14, 3.14, 3.14]},
                },
                "originalSnapshot": {
                    "position": [0, 0, 0],
                    "rotation": [0, 0, 0],
                    "scale": [1, 1, 1],
                    "materialName": "hat_red_fabric",
                    "color": "#cc3333",
                    "visible": True,
                },
            }
        ],
    }
    response = client.put(f"/api/projects/{project_id}/components", json=payload)
    assert response.status_code == 200


def seed_workspace_scene(client: TestClient, project_id: str):
    response = client.patch(
        f"/api/projects/{project_id}/workspace",
        json={
            "scene": {
                "components": [
                    {
                        "id": "hat_red_band",
                        "name": "Hat Red Band",
                        "visible": True,
                        "material": {"color": "#cc3333", "type": "standard"},
                        "transform": {
                            "position": [0, 0, 0],
                            "rotation": [0, 0, 0],
                            "scale": [1, 1, 1],
                        },
                    }
                ]
            }
        },
    )
    assert response.status_code == 200


def test_operations_apply_to_workspace_scene_and_history():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_component_registry(client, project_id)
    seed_workspace_scene(client, project_id)

    response = client.post(
        f"/api/projects/{project_id}/operations",
        json={
            "source": "config",
            "label": "Band update",
            "operations": [
                {"op": "setColor", "targetId": "hat_red_band", "payload": {"color": "#111827"}},
                {"op": "setVisibility", "targetId": "hat_red_band", "payload": {"visible": False}},
                {"op": "setScale", "targetId": "hat_red_band", "payload": {"scale": [1.2, 1.0, 1.0]}},
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    component = payload["workspace"]["scene"]["components"][0]
    assert component["material"]["color"] == "#111827"
    assert component["visible"] is False
    assert component["transform"]["scale"] == [1.2, 1.0, 1.0]
    assert payload["workspace"]["lastOperations"][0]["source"] == "config"
    assert payload["workspace"]["variantHistory"][-1]["label"] == "Band update"
    assert payload["workspace"]["history"]["past"]
    assert payload["operations"][0]["targetId"] == "hat_red_band"


def test_operations_reject_unknown_target():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_component_registry(client, project_id)

    response = client.post(
        f"/api/projects/{project_id}/operations",
        json={"operations": [{"op": "setColor", "targetId": "missing", "payload": {"color": "#111827"}}]},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == 'Unknown targetId "missing".'


def test_operations_reject_disallowed_operation():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_component_registry(client, project_id, operations=["setVisibility"])

    response = client.post(
        f"/api/projects/{project_id}/operations",
        json={"operations": [{"op": "setColor", "targetId": "hat_red_band", "payload": {"color": "#111827"}}]},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Component hat_red_band does not allow setColor operations."


def test_operations_reject_transform_bounds_violation():
    client = TestClient(app)
    project_id = unique_project_id()
    seed_component_registry(client, project_id)

    response = client.post(
        f"/api/projects/{project_id}/operations",
        json={"operations": [{"op": "setScale", "targetId": "hat_red_band", "payload": {"scale": [9, 1, 1]}}]},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "operation.payload.scale[0] is above the allowed maximum."
