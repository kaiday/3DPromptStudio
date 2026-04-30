import sqlite3

from fastapi import APIRouter, Depends

from app.db.session import get_db
from app.schemas.interactions import (
    ComponentInteractionResponse,
    ComponentInteractionsPayload,
    ComponentInteractionsResponse,
)
from app.services.interaction_service import (
    delete_component_interaction,
    list_component_interactions,
    replace_component_interactions,
)

router = APIRouter(
    prefix="/projects/{project_id}/components/{component_id}/interactions",
    tags=["component interactions"],
)


@router.get("")
def get_interactions(
    project_id: str,
    component_id: str,
    db: sqlite3.Connection = Depends(get_db),
) -> ComponentInteractionsResponse:
    interactions = list_component_interactions(db, project_id, component_id)
    return ComponentInteractionsResponse(interactions=interactions)


@router.put("")
def put_interactions(
    project_id: str,
    component_id: str,
    payload: ComponentInteractionsPayload,
    db: sqlite3.Connection = Depends(get_db),
) -> ComponentInteractionsResponse:
    interactions = replace_component_interactions(db, project_id, component_id, payload)
    return ComponentInteractionsResponse(interactions=interactions)


@router.delete("/{interaction_id}")
def remove_interaction(
    project_id: str,
    component_id: str,
    interaction_id: str,
    db: sqlite3.Connection = Depends(get_db),
) -> ComponentInteractionResponse:
    interaction = delete_component_interaction(db, project_id, component_id, interaction_id)
    return ComponentInteractionResponse(interaction=interaction)
