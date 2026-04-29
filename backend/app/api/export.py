import sqlite3

from fastapi import APIRouter, Depends

from app.db.session import get_db
from app.schemas.export import ExportRequestPayload, ExportResponse
from app.services.export_service import create_export_request

router = APIRouter(prefix="/projects/{project_id}/export", tags=["export"])


@router.post("")
def post_export(project_id: str, payload: ExportRequestPayload, db: sqlite3.Connection = Depends(get_db)) -> ExportResponse:
    export = create_export_request(db, project_id, payload)
    return ExportResponse(export=export)
