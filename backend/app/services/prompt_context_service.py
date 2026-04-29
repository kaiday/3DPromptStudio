import sqlite3

from app.schemas.prompts import PromptContext
from app.schemas.workspace import Workspace
from app.services.component_service import get_component_registry

MAX_CONTEXT_COMPONENTS = 80
MAX_RECENT_ITEMS = 8


def _compact_component(component) -> dict:
    return {
        "id": component.id,
        "name": component.name,
        "meshName": component.mesh_name,
        "materialName": component.material_name,
        "editable": component.editable,
        "allowedOperations": component.allowed_operations,
        "transformBounds": component.transform_bounds.model_dump(by_alias=True),
    }


def _compact_scene_component(component: dict) -> dict:
    return {
        "id": component.get("id"),
        "name": component.get("name"),
        "visible": component.get("visible", True),
        "material": {
            "color": component.get("material", {}).get("color"),
            "type": component.get("material", {}).get("type"),
        },
        "transform": {
            "position": component.get("transform", {}).get("position", [0, 0, 0]),
            "rotation": component.get("transform", {}).get("rotation", [0, 0, 0]),
            "scale": component.get("transform", {}).get("scale", [1, 1, 1]),
        },
    }


def build_prompt_context(db: sqlite3.Connection, workspace: Workspace) -> PromptContext:
    registry = get_component_registry(db, workspace.project_id)
    components = [_compact_component(component) for component in registry.components]
    selected_component = next(
        (component for component in components if component["id"] == workspace.selected_part_id),
        None,
    )
    allowed_operations = sorted({operation for component in components for operation in component["allowedOperations"]})
    current_variant = {
        "id": workspace.current_variant_id,
        "lastOperations": [operation.model_dump(by_alias=True) for operation in workspace.last_operations[-MAX_RECENT_ITEMS:]],
    }

    return PromptContext(
        project_id=workspace.project_id,
        workspace_id=workspace.workspace_id,
        model_id=workspace.model_id,
        selected_part_id=workspace.selected_part_id,
        selected_tool=workspace.selected_tool,
        right_panel_mode=workspace.right_panel_mode,
        selected_component=selected_component,
        components=components[:MAX_CONTEXT_COMPONENTS],
        scene_components=[_compact_scene_component(component) for component in workspace.scene.components[:MAX_CONTEXT_COMPONENTS]],
        current_variant=current_variant,
        allowed_operations=allowed_operations,
        constraints={
            "noRawGeometry": True,
            "destructiveCutsSupported": False,
            "operationOutputOnly": True,
        },
    )
