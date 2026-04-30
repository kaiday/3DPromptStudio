from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def unique_project_id() -> str:
    return f"project_{uuid4().hex}"


def interactions_url(project_id: str, component_id: str = "npc_wizard") -> str:
    return f"/api/projects/{project_id}/components/{component_id}/interactions"


def test_list_interactions_returns_empty_for_component_without_interactions():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.get(interactions_url(project_id))

    assert response.status_code == 200
    assert response.json() == {"interactions": []}


def test_put_interactions_persists_dialogue_lines():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.put(
        interactions_url(project_id),
        json={
            "interactions": [
                {
                    "kind": "dialogue",
                    "label": "Greeting",
                    "payload": {"lines": ["Welcome to NervOrg.", "Try selecting the glowing door."]},
                }
            ]
        },
    )

    assert response.status_code == 200
    interactions = response.json()["interactions"]
    assert len(interactions) == 1
    interaction = interactions[0]
    assert interaction["id"].startswith("interaction_")
    assert interaction["projectId"] == project_id
    assert interaction["componentId"] == "npc_wizard"
    assert interaction["kind"] == "dialogue"
    assert interaction["label"] == "Greeting"
    assert interaction["payload"]["lines"] == ["Welcome to NervOrg.", "Try selecting the glowing door."]
    assert interaction["createdAt"]
    assert interaction["updatedAt"]

    get_response = client.get(interactions_url(project_id))
    assert get_response.status_code == 200
    assert get_response.json()["interactions"] == interactions


def test_put_interactions_replaces_stale_interactions_for_component():
    client = TestClient(app)
    project_id = unique_project_id()
    url = interactions_url(project_id)

    first_response = client.put(
        url,
        json={
            "interactions": [
                {"kind": "dialogue", "label": "Old line", "payload": {"lines": ["Old"]}},
                {"kind": "hotspot", "label": "Old hotspot", "payload": {"radius": 2}},
            ]
        },
    )
    assert first_response.status_code == 200
    first_interaction = first_response.json()["interactions"][0]

    second_response = client.put(
        url,
        json={
            "interactions": [
                {
                    "id": first_interaction["id"],
                    "kind": "dialogue",
                    "label": "Updated line",
                    "payload": {"lines": ["Updated"]},
                }
            ]
        },
    )

    assert second_response.status_code == 200
    interactions = second_response.json()["interactions"]
    assert len(interactions) == 1
    assert interactions[0]["id"] == first_interaction["id"]
    assert interactions[0]["label"] == "Updated line"
    assert interactions[0]["payload"] == {"lines": ["Updated"]}
    assert interactions[0]["createdAt"] == first_interaction["createdAt"]


def test_delete_interaction_removes_one_interaction():
    client = TestClient(app)
    project_id = unique_project_id()
    url = interactions_url(project_id)

    create_response = client.put(
        url,
        json={
            "interactions": [
                {"kind": "dialogue", "label": "Talk", "payload": {"lines": ["Hello"]}},
                {"kind": "trigger", "label": "Open gate", "payload": {"event": "gate.open"}},
            ]
        },
    )
    assert create_response.status_code == 200
    interactions = create_response.json()["interactions"]

    delete_response = client.delete(f"{url}/{interactions[0]['id']}")

    assert delete_response.status_code == 200
    assert delete_response.json()["interaction"]["id"] == interactions[0]["id"]

    get_response = client.get(url)
    assert get_response.status_code == 200
    remaining = get_response.json()["interactions"]
    assert [interaction["id"] for interaction in remaining] == [interactions[1]["id"]]


def test_delete_unknown_interaction_returns_404():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.delete(f"{interactions_url(project_id)}/interaction_missing")

    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown component interaction: interaction_missing."


def test_invalid_interaction_kind_is_rejected():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.put(
        interactions_url(project_id),
        json={"interactions": [{"kind": "inventory", "label": "Bag", "payload": {}}]},
    )

    assert response.status_code == 422
