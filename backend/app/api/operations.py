import sqlite3

from fastapi import APIRouter, Depends

from app.db.session import get_db
from app.schemas.operations import OperationBatch
from app.services.operation_service import apply_operation_batch

router = APIRouter(prefix="/projects/{project_id}/operations", tags=["operations"])


@router.post("")
def post_operations(project_id: str, batch: OperationBatch, db: sqlite3.Connection = Depends(get_db)):
    workspace, operations = apply_operation_batch(db, project_id, batch)
    return {
        "workspace": workspace.model_dump(by_alias=True),
        "operations": [operation.model_dump(by_alias=True) for operation in operations],
    }
