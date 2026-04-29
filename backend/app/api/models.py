import sqlite3

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse

from app.db.session import get_db
from app.services.model_service import create_model, get_model_file, get_model_metadata, parse_multipart_upload
from app.services.workspace_service import attach_model_to_workspace

router = APIRouter(tags=["models"])


@router.post("/projects/{project_id}/models/upload")
async def upload_model(project_id: str, request: Request, db: sqlite3.Connection = Depends(get_db)):
    filename, content, content_type, source, title = await parse_multipart_upload(request)
    model = create_model(db, project_id, filename, content, content_type, source, title)
    attach_model_to_workspace(db, project_id, model.id)
    return {"model": model.model_dump(by_alias=True)}


@router.get("/models/{model_id}/file")
def read_model_file(model_id: str, db: sqlite3.Connection = Depends(get_db)):
    model, file_path = get_model_file(db, model_id)
    return FileResponse(
        file_path,
        media_type=model.content_type,
        filename=model.original_filename,
    )


@router.get("/models/{model_id}/metadata")
def read_model_metadata(model_id: str, db: sqlite3.Connection = Depends(get_db)):
    metadata = get_model_metadata(db, model_id)
    return {"metadata": metadata.model_dump(by_alias=True)}
