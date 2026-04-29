import sqlite3

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.db.session import get_db
from app.schemas.operations import OperationBatchRequest
from app.services.component_service import get_component_registry
from app.services.operation_service import OperationValidationError, apply_operation_request

router = APIRouter(prefix="/projects/{project_id}/operations", tags=["operations"])


@router.post("")
def validate_operations(
    project_id: str,
    payload: OperationBatchRequest,
    db: sqlite3.Connection = Depends(get_db),
):
    registry = get_component_registry(db, project_id)
    try:
        response = apply_operation_request(db, project_id, payload, registry)
    except OperationValidationError as error:
        return JSONResponse(status_code=400, content={"ok": False, "error": error.error.model_dump(by_alias=True)})
    return response.model_dump(by_alias=True)
