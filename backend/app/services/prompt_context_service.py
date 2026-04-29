from app.schemas.components import ComponentRegistry
from app.schemas.workspace import Workspace

MAX_CONTEXT_COMPONENTS = 80
MAX_RECENT_ITEMS = 8


def build_prompt_context(
    registry: ComponentRegistry,
    *,
    scene_id: str | None = None,
    selected_component_id: str | None = None,
    workspace: Workspace | None = None,
) -> dict:
    selected_id = selected_component_id or (workspace.selected_part_id if workspace else None)
    selected = None
    components = []
    for component in registry.components[:MAX_CONTEXT_COMPONENTS]:
        item = {
            "id": component.id,
            "name": component.name,
            "type": infer_component_type(component),
            "editable": component.editable,
            "meshName": component.mesh_name,
            "allowedOperations": component.allowed_operations,
            "tags": build_component_tags(component),
        }
        components.append(item)
        if selected_id and component.id == selected_id:
            selected = item

    return {
        "scene": {
            "id": scene_id,
            "revisionId": registry.updated_at,
        },
        "workspace": build_workspace_context(workspace),
        "selectedComponent": selected,
        "components": components,
        "sceneComponents": build_scene_components(workspace),
        "allowedOperationTypes": ["setColor", "setVisibility", "setMaterial", "setPosition", "setScale", "setRotation"],
        "constraints": {
            "noRawGeometry": True,
            "operationOutputOnly": True,
        },
    }


def build_workspace_context(workspace: Workspace | None) -> dict | None:
    if not workspace:
        return None
    return {
        "id": workspace.workspace_id,
        "projectId": workspace.project_id,
        "modelId": workspace.model_id,
        "selectedPartId": workspace.selected_part_id,
        "currentVariantId": workspace.current_variant_id,
        "lastOperations": [operation.model_dump(by_alias=True) for operation in workspace.last_operations[-MAX_RECENT_ITEMS:]],
    }


def build_scene_components(workspace: Workspace | None) -> list[dict]:
    if not workspace:
        return []
    return [
        {
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
        for component in workspace.scene.components[:MAX_CONTEXT_COMPONENTS]
    ]


def infer_component_type(component) -> str:
    for operation in ("annotation", "line", "cut_annotation"):
        if operation in component.allowed_operations and len(component.allowed_operations) == 1:
            return operation
    name = f"{component.id} {component.name or ''} {component.mesh_name}".lower()
    if "camera" in name:
        return "camera"
    if "light" in name:
        return "light"
    if "label" in name:
        return "label"
    if "sign" in name:
        return "sign"
    if "road" in name:
        return "road"
    if "child" in name or "cat" in name:
        return "character"
    return "prop"


def build_component_tags(component) -> list[str]:
    values = {component.id.replace("_", " ")}
    if component.name:
        values.add(component.name.lower())
    if component.mesh_name:
        values.add(component.mesh_name.replace("_", " ").lower())
    values.update(build_alias_tags(component.id, component.name or "", component.mesh_name))
    return sorted(values)


def build_alias_tags(component_id: str, name: str, mesh_name: str) -> set[str]:
    text = f"{component_id} {name} {mesh_name}".lower().replace("_", " ")
    aliases: set[str] = set()
    if "chair seat" in text:
        aliases.add("cushion")
        aliases.add("seat")
    if "chair legs" in text:
        aliases.add("legs")
    if "hat red band" in text or "hat band" in text:
        aliases.add("hat band")
        aliases.add("band")
    if "top hat" in text or "hat top" in text:
        aliases.add("top hat")
        aliases.add("hat")
    return aliases
