import sqlite3

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.db.session import get_db
from app.schemas.prompts import PromptInterpretRequest
from app.services.component_service import get_component_registry
from app.services.operation_service import OperationValidationError
from app.services.prompt_service import interpret_prompt as interpret_prompt_request

router = APIRouter(prefix="/projects/{project_id}/prompt", tags=["prompts"])


@router.post("")
def interpret_prompt(
    project_id: str,
    payload: PromptInterpretRequest,
    db: sqlite3.Connection = Depends(get_db),
):
    registry = get_component_registry(db, project_id)
    try:
        response, source = interpret_prompt_request(project_id, payload, registry, db)
    except OperationValidationError as error:
        body = {
            "ok": False,
            "source": "prompt_interpreter",
            "requiresClarification": error.error.code == "AMBIGUOUS_TARGET",
            "requiresGeneration": error.error.code == "STRUCTURAL_EDIT_REQUIRES_GENERATION",
            "error": error.error.model_dump(by_alias=True),
        }
        return JSONResponse(status_code=400, content=body)
    return {
        "ok": True,
        "source": source,
        "operations": [operation.model_dump(by_alias=True) for operation in response.operations],
        "warnings": [warning.model_dump(by_alias=True) for warning in response.warnings],
        "revisionId": response.revision_id,
        "workspace": response.workspace,
        "requiresClarification": False,
        "requiresGeneration": False,
    }
