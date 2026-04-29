import sqlite3

from fastapi import APIRouter, Depends

from app.db.session import get_db
from app.schemas.prompts import PromptRequest
from app.services.prompt_context_service import build_prompt_context
from app.services.prompt_service import apply_prompt
from app.services.workspace_service import get_workspace

router = APIRouter(prefix="/projects/{project_id}/prompt", tags=["prompts"])


@router.post("")
def post_prompt(project_id: str, payload: PromptRequest, db: sqlite3.Connection = Depends(get_db)):
    workspace = get_workspace(db, project_id)
    prompt_context = build_prompt_context(db, workspace)
    updated_workspace, operations, reasoning = apply_prompt(db, project_id, payload.prompt, prompt_context)
    return {
        "workspace": updated_workspace.model_dump(by_alias=True),
        "operations": [operation.model_dump(by_alias=True) for operation in operations],
        "reasoning": reasoning,
        "promptContext": prompt_context.model_dump(by_alias=True),
    }
