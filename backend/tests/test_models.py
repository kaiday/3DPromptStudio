from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def unique_project_id() -> str:
    return f"project_{uuid4().hex}"


def test_glb_upload_metadata_and_file_serving():
    client = TestClient(app)
    project_id = unique_project_id()
    glb_content = b"glTF" + b"\x02\x00\x00\x00" + b"demo-glb-bytes"

    response = client.post(
        f"/api/projects/{project_id}/models/upload",
        files={"file": ("cat_wearing_hat.glb", glb_content, "model/gltf-binary")},
        data={"source": "upload", "title": "Cat Wearing Hat"},
    )

    assert response.status_code == 200
    model = response.json()["model"]
    assert model["id"].startswith("model_")
    assert model["projectId"] == project_id
    assert model["originalFilename"] == "cat_wearing_hat.glb"
    assert model["contentType"] == "model/gltf-binary"
    assert model["sizeBytes"] == len(glb_content)
    assert model["source"] == "upload"
    assert model["title"] == "Cat Wearing Hat"
    assert model["fileUrl"] == f"/api/models/{model['id']}/file"
    assert model["metadataUrl"] == f"/api/models/{model['id']}/metadata"

    response = client.get(model["metadataUrl"])
    assert response.status_code == 200
    metadata = response.json()["metadata"]
    assert metadata["modelId"] == model["id"]
    assert metadata["projectId"] == project_id
    assert metadata["componentRegistryStatus"] == "pending"

    response = client.get(model["fileUrl"])
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("model/gltf-binary")
    assert response.content == glb_content


def test_model_upload_rejects_non_glb_file():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.post(
        f"/api/projects/{project_id}/models/upload",
        files={"file": ("cat.obj", b"obj data", "application/octet-stream")},
        data={"source": "upload"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Only .glb files are supported."


def test_model_upload_requires_multipart():
    client = TestClient(app)
    project_id = unique_project_id()

    response = client.post(
        f"/api/projects/{project_id}/models/upload",
        content=b"not multipart",
        headers={"content-type": "application/octet-stream"},
    )

    assert response.status_code == 415
