from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def unique_project_id() -> str:
    return f"project_{uuid4().hex}"


def test_annotation_crud_and_filters():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.post(
        f"/api/projects/{project_id}/annotations",
        json={
            "type": "pin",
            "targetType": "component",
            "partId": "seat",
            "variantId": "variant_blue",
            "position": [0.1, 1.2, -0.3],
            "normal": [0, 1, 0],
            "note": "make this softer",
            "authorId": "tester",
        },
    )

    assert response.status_code == 201
    annotation = response.json()["annotation"]
    assert annotation["id"].startswith("anno_")
    assert annotation["projectId"] == project_id
    assert annotation["partId"] == "seat"
    assert annotation["targetType"] == "component"
    assert annotation["status"] == "open"

    client.post(
        f"/api/projects/{project_id}/annotations",
        json={"type": "text_note", "note": "global note", "status": "resolved"},
    )

    response = client.get(f"/api/projects/{project_id}/annotations?partId=seat&type=pin&status=open&variantId=variant_blue")
    assert response.status_code == 200
    annotations = response.json()["annotations"]
    assert len(annotations) == 1
    assert annotations[0]["id"] == annotation["id"]

    response = client.patch(
        f"/api/projects/{project_id}/annotations/{annotation['id']}",
        json={"status": "resolved", "note": "updated note"},
    )
    assert response.status_code == 200
    updated = response.json()["annotation"]
    assert updated["status"] == "resolved"
    assert updated["note"] == "updated note"
    assert updated["createdAt"] == annotation["createdAt"]
    assert updated["updatedAt"] != annotation["updatedAt"]

    response = client.delete(f"/api/projects/{project_id}/annotations/{annotation['id']}")
    assert response.status_code == 200
    assert response.json()["annotation"]["id"] == annotation["id"]

    response = client.get(f"/api/projects/{project_id}/annotations?partId=seat")
    assert response.status_code == 200
    assert response.json()["annotations"] == []


def test_line_annotation_requires_points_or_screen_points():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.post(
        f"/api/projects/{project_id}/annotations",
        json={"type": "line", "partId": "leg", "targetType": "component"},
    )
    assert response.status_code == 422

    response = client.post(
        f"/api/projects/{project_id}/annotations",
        json={
            "type": "line",
            "partId": "leg",
            "targetType": "component",
            "points": [[0, 0, 0], [1, 0, 0]],
            "label": "extend edge",
        },
    )
    assert response.status_code == 201
    annotation = response.json()["annotation"]
    assert annotation["type"] == "line"
    assert annotation["points"] == [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]]


def test_cut_guide_requires_points_screen_points_or_cut_plane():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.post(
        f"/api/projects/{project_id}/annotations",
        json={"type": "cut_guide", "partId": "base", "targetType": "component"},
    )
    assert response.status_code == 422

    response = client.post(
        f"/api/projects/{project_id}/annotations",
        json={
            "type": "cut_guide",
            "partId": "base",
            "targetType": "component",
            "cutPlane": {"origin": [0, 0.5, 0], "normal": [0, 1, 0]},
            "note": "proposed cut only",
        },
    )
    assert response.status_code == 201
    annotation = response.json()["annotation"]
    assert annotation["type"] == "cut_guide"
    assert annotation["cutPlane"]["normal"] == [0.0, 1.0, 0.0]


def test_unknown_annotation_returns_404():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.patch(
        f"/api/projects/{project_id}/annotations/anno_missing",
        json={"note": "missing"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown annotation: anno_missing."
