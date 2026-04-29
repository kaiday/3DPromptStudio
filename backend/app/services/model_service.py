import re
import sqlite3
from datetime import UTC, datetime
from email.parser import BytesParser
from email.policy import default
from typing import cast

from fastapi import HTTPException, Request, status

from app.core.config import get_settings
from app.schemas.models import ModelMetadata, ModelRecord, ModelSource, StoredModel
from app.storage.model_storage import create_model_id, read_model_file_path, write_model_file

GLB_CONTENT_TYPE = "model/gltf-binary"
OCTET_STREAM = "application/octet-stream"
ALLOWED_SOURCES: set[str] = {"upload", "blender_worker"}


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def sanitize_filename(filename: str) -> str:
    cleaned = filename.replace("\\", "/").split("/")[-1].strip()
    return re.sub(r"[^A-Za-z0-9._ -]+", "_", cleaned) or "model.glb"


def _row_to_stored_model(row: sqlite3.Row) -> StoredModel:
    record = ModelRecord(
        id=row["id"],
        projectId=row["project_id"],
        originalFilename=row["original_filename"],
        contentType=row["content_type"],
        sizeBytes=row["size_bytes"],
        source=row["source"],
        title=row["title"],
        fileUrl=f"/api/models/{row['id']}/file",
        metadataUrl=f"/api/models/{row['id']}/metadata",
        createdAt=row["created_at"],
    )
    return StoredModel(record=record, storagePath=row["storage_path"])


async def parse_multipart_upload(request: Request) -> tuple[str, bytes, str, ModelSource, str | None]:
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" not in content_type:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Upload must use multipart/form-data.")

    body = await request.body()
    if len(body) > get_settings().max_model_upload_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Model file is too large.")

    message = BytesParser(policy=default).parsebytes(
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8") + body
    )

    filename: str | None = None
    file_content: bytes | None = None
    file_content_type = GLB_CONTENT_TYPE
    source = "upload"
    title: str | None = None

    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if name == "file":
            filename = sanitize_filename(part.get_filename() or "")
            file_content = part.get_payload(decode=True) or b""
            file_content_type = part.get_content_type() or GLB_CONTENT_TYPE
        elif name == "source":
            source = (part.get_payload(decode=True) or b"upload").decode("utf-8").strip() or "upload"
        elif name == "title":
            title = (part.get_payload(decode=True) or b"").decode("utf-8").strip() or None

    if not filename or file_content is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Multipart field 'file' is required.")
    if not filename.lower().endswith(".glb"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .glb files are supported.")
    if file_content_type not in {GLB_CONTENT_TYPE, OCTET_STREAM}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File content type must be model/gltf-binary.")
    if len(file_content) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model file is empty.")
    if len(file_content) > get_settings().max_model_upload_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Model file is too large.")
    if source not in ALLOWED_SOURCES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source must be upload or blender_worker.")

    return filename, file_content, GLB_CONTENT_TYPE, cast(ModelSource, source), title


def create_model(
    db: sqlite3.Connection,
    project_id: str,
    original_filename: str,
    content: bytes,
    content_type: str,
    source: ModelSource,
    title: str | None,
) -> ModelRecord:
    model_id = create_model_id()
    created_at = now_iso()
    storage_path = write_model_file(model_id, content)

    db.execute(
        """
        INSERT INTO models (
          id,
          project_id,
          original_filename,
          content_type,
          size_bytes,
          source,
          title,
          storage_path,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            model_id,
            project_id,
            original_filename,
            content_type,
            len(content),
            source,
            title,
            str(storage_path),
            created_at,
        ),
    )
    db.commit()

    return ModelRecord(
        id=model_id,
        projectId=project_id,
        originalFilename=original_filename,
        contentType=content_type,
        sizeBytes=len(content),
        source=source,
        title=title,
        fileUrl=f"/api/models/{model_id}/file",
        metadataUrl=f"/api/models/{model_id}/metadata",
        createdAt=created_at,
    )


def get_stored_model(db: sqlite3.Connection, model_id: str) -> StoredModel:
    row = db.execute("SELECT * FROM models WHERE id = ?", (model_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown model: {model_id}.")
    return _row_to_stored_model(row)


def get_model_file(db: sqlite3.Connection, model_id: str):
    stored_model = get_stored_model(db, model_id)
    return stored_model.record, read_model_file_path(stored_model.storage_path)


def get_model_metadata(db: sqlite3.Connection, model_id: str) -> ModelMetadata:
    stored_model = get_stored_model(db, model_id)
    record = stored_model.record
    return ModelMetadata(
        modelId=record.id,
        projectId=record.project_id,
        originalFilename=record.original_filename,
        source=record.source,
        sizeBytes=record.size_bytes,
        title=record.title,
        componentRegistryStatus="pending",
    )
