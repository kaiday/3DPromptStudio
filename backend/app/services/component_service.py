import json
import sqlite3

from fastapi import HTTPException, status

from app.schemas.components import (
    Component,
    ComponentConfig,
    ComponentRegistry,
    ComponentRegistryPayload,
    build_component_config,
    default_registry,
    now_iso,
)


def _save_registry(db: sqlite3.Connection, registry: ComponentRegistry) -> ComponentRegistry:
    db.execute(
        """
        INSERT INTO component_registries (
          project_id,
          model_id,
          registry_json,
          updated_at
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          model_id = excluded.model_id,
          registry_json = excluded.registry_json,
          updated_at = excluded.updated_at
        """,
        (
            registry.project_id,
            registry.model_id,
            registry.model_dump_json(by_alias=True),
            registry.updated_at,
        ),
    )
    db.commit()
    return registry


def get_component_registry(db: sqlite3.Connection, project_id: str) -> ComponentRegistry:
    row = db.execute(
        "SELECT registry_json FROM component_registries WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    if not row:
        registry = default_registry(project_id)
        return _save_registry(db, registry)

    try:
        return ComponentRegistry.model_validate(json.loads(row["registry_json"]))
    except (json.JSONDecodeError, ValueError):
        registry = default_registry(project_id)
        return _save_registry(db, registry)


def save_component_registry(
    db: sqlite3.Connection,
    project_id: str,
    payload: ComponentRegistryPayload,
) -> ComponentRegistry:
    registry = ComponentRegistry(
        projectId=project_id,
        modelId=payload.model_id,
        components=payload.components,
        updatedAt=now_iso(),
    )
    return _save_registry(db, registry)


def get_component(db: sqlite3.Connection, project_id: str, part_id: str) -> Component:
    registry = get_component_registry(db, project_id)
    for component in registry.components:
        if component.id == part_id:
            return component
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown component: {part_id}.")


def get_component_config(db: sqlite3.Connection, project_id: str, part_id: str) -> ComponentConfig:
    return build_component_config(project_id, get_component(db, project_id, part_id))
