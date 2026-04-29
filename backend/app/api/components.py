import sqlite3

from fastapi import APIRouter, Depends

from app.db.session import get_db
from app.schemas.components import ComponentRegistryPayload
from app.services.component_service import get_component_config, get_component_registry, save_component_registry

router = APIRouter(prefix="/projects/{project_id}/components", tags=["components"])


@router.get("")
def read_component_registry(project_id: str, db: sqlite3.Connection = Depends(get_db)):
    registry = get_component_registry(db, project_id)
    return {"registry": registry.model_dump(by_alias=True)}


@router.put("")
def put_component_registry(
    project_id: str,
    payload: ComponentRegistryPayload,
    db: sqlite3.Connection = Depends(get_db),
):
    registry = save_component_registry(db, project_id, payload)
    return {"registry": registry.model_dump(by_alias=True)}


@router.get("/{part_id}/config")
def read_component_config(project_id: str, part_id: str, db: sqlite3.Connection = Depends(get_db)):
    config = get_component_config(db, project_id, part_id)
    return {"config": config.model_dump(by_alias=True)}
