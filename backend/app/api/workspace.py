import sqlite3

from fastapi import APIRouter, Depends

from app.db.session import get_db
from app.schemas.workspace import WorkspacePatch
from app.services.workspace_service import get_workspace, redo_workspace, undo_workspace, update_workspace

router = APIRouter(prefix="/projects/{project_id}/workspace", tags=["workspace"])


@router.get("")
def read_workspace(project_id: str, db: sqlite3.Connection = Depends(get_db)):
    return {"workspace": get_workspace(db, project_id).model_dump(by_alias=True)}


@router.patch("")
def patch_workspace(project_id: str, patch: WorkspacePatch, db: sqlite3.Connection = Depends(get_db)):
    return {"workspace": update_workspace(db, project_id, patch).model_dump(by_alias=True)}


@router.post("/undo")
def undo(project_id: str, db: sqlite3.Connection = Depends(get_db)):
    return {"workspace": undo_workspace(db, project_id).model_dump(by_alias=True)}


@router.post("/redo")
def redo(project_id: str, db: sqlite3.Connection = Depends(get_db)):
    return {"workspace": redo_workspace(db, project_id).model_dump(by_alias=True)}
