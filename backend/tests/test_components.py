from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def unique_project_id() -> str:
    return f"project_{uuid4().hex}"


def registry_payload(model_id: str = "model_cat"):
    return {
        "modelId": model_id,
        "components": [
            {
                "id": "hat_red_band",
                "name": "hat_red_band",
                "meshName": "hat_red_band",
                "materialName": "hat_red_fabric",
                "editable": True,
                "allowedOperations": ["setColor", "setVisibility", "setScale"],
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


def test_component_registry_save_load_and_config():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.get(f"/api/projects/{project_id}/components")
    assert response.status_code == 200
    assert response.json()["registry"]["components"] == []

    response = client.put(f"/api/projects/{project_id}/components", json=registry_payload())
    assert response.status_code == 200
    saved = response.json()["registry"]
    assert saved["projectId"] == project_id
    assert saved["modelId"] == "model_cat"
    assert saved["components"][0]["id"] == "hat_red_band"

    response = client.get(f"/api/projects/{project_id}/components")
    assert response.status_code == 200
    loaded = response.json()["registry"]
    assert loaded["components"][0]["meshName"] == "hat_red_band"

    response = client.get(f"/api/projects/{project_id}/components/hat_red_band/config")
    assert response.status_code == 200
    config = response.json()["config"]
    assert config["partId"] == "hat_red_band"
    assert config["component"]["materialName"] == "hat_red_fabric"
    assert [field["operation"] for field in config["editableFields"]] == [
        "setColor",
        "setVisibility",
        "setScale",
    ]
    assert config["transformBounds"]["scale"]["max"] == [2.0, 2.0, 2.0]


def test_component_registry_accepts_legacy_operation_aliases():
    client = TestClient(app)
    project_id = unique_project_id()
    payload = registry_payload()
    payload["components"][0]["allowedOperations"] = ["colour", "visibility", "scale"]

    response = client.put(f"/api/projects/{project_id}/components", json=payload)

    assert response.status_code == 200
    operations = response.json()["registry"]["components"][0]["allowedOperations"]
    assert operations == ["setColor", "setVisibility", "setScale"]


def test_component_config_rejects_unknown_part():
    client = TestClient(app)
    project_id = unique_project_id()
    response = client.put(f"/api/projects/{project_id}/components", json=registry_payload())
    assert response.status_code == 200

    response = client.get(f"/api/projects/{project_id}/components/missing_part/config")

    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown component: missing_part."
