import copy
import re
import sqlite3
from typing import Any

from fastapi import HTTPException, status

from app.schemas.components import Component
from app.schemas.operations import Operation, OperationBatch, ValidatedOperation, now_iso
from app.schemas.workspace import SceneState, VariantHistoryEntry, Workspace
from app.services.component_service import get_component_registry
from app.services.workspace_service import get_workspace, save_workspace, snapshot_workspace


def _validate_vector(value: Any, field_name: str) -> list[float]:
    if not isinstance(value, list) or len(value) != 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} must be an array of three numbers.")
    if not all(isinstance(item, int | float) for item in value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} must be an array of three numbers.")
    return [float(item) for item in value]


def _assert_vector_bounds(value: list[float], bounds, field_name: str) -> None:
    for index, item in enumerate(value):
        min_value = bounds.min[index]
        max_value = bounds.max[index]
        if item < min_value:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name}[{index}] is below the allowed minimum.")
        if item > max_value:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name}[{index}] is above the allowed maximum.")


def _validate_hex_color(value: Any) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="operation.payload.color must be a #RRGGBB hex colour.")
    return value


def _validate_payload(operation: Operation, component: Component) -> dict[str, Any]:
    payload = operation.payload
    if operation.op == "setColor":
        return {"color": _validate_hex_color(payload.get("color"))}
    if operation.op == "setVisibility":
        if not isinstance(payload.get("visible"), bool):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="operation.payload.visible must be a boolean.")
        return {"visible": payload["visible"]}
    if operation.op == "setMaterial":
        if not isinstance(payload.get("type"), str) or not payload["type"].strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="operation.payload.type must be a string.")
        return {"type": payload["type"]}
    if operation.op == "setPosition":
        position = _validate_vector(payload.get("position"), "operation.payload.position")
        _assert_vector_bounds(position, component.transform_bounds.position, "operation.payload.position")
        return {"position": position}
    if operation.op == "setScale":
        scale = _validate_vector(payload.get("scale"), "operation.payload.scale")
        _assert_vector_bounds(scale, component.transform_bounds.scale, "operation.payload.scale")
        return {"scale": scale}
    if operation.op == "setRotation":
        rotation = _validate_vector(payload.get("rotation"), "operation.payload.rotation")
        _assert_vector_bounds(rotation, component.transform_bounds.rotation, "operation.payload.rotation")
        return {"rotation": rotation}
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f'Unsupported operation "{operation.op}".')


def validate_operations(db: sqlite3.Connection, project_id: str, operations: list[Operation], source: str) -> list[ValidatedOperation]:
    registry = get_component_registry(db, project_id)
    components_by_id = {component.id: component for component in registry.components}
    validated: list[ValidatedOperation] = []

    for operation in operations:
        component = components_by_id.get(operation.target_id)
        if not component:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f'Unknown targetId "{operation.target_id}".')
        if not component.editable:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Component {operation.target_id} is not editable.")
        if operation.op not in component.allowed_operations:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Component {operation.target_id} does not allow {operation.op} operations.")

        validated.append(
            ValidatedOperation(
                op=operation.op,
                targetId=operation.target_id,
                payload=_validate_payload(operation, component),
                timestamp=operation.timestamp or now_iso(),
                source=operation.source or source,
            )
        )

    return validated


def _default_scene_component(component_id: str) -> dict[str, Any]:
    return {
        "id": component_id,
        "name": component_id,
        "visible": True,
        "material": {"color": "#cccccc", "type": "standard"},
        "transform": {
            "position": [0.0, 0.0, 0.0],
            "rotation": [0.0, 0.0, 0.0],
            "scale": [1.0, 1.0, 1.0],
        },
    }


def _apply_operation(component: dict[str, Any], operation: ValidatedOperation) -> dict[str, Any]:
    next_component = copy.deepcopy(component)
    next_component.setdefault("material", {})
    next_component.setdefault("transform", {})

    if operation.op == "setColor":
        next_component["material"]["color"] = operation.payload["color"]
    elif operation.op == "setMaterial":
        next_component["material"]["type"] = operation.payload["type"]
    elif operation.op == "setVisibility":
        next_component["visible"] = operation.payload["visible"]
    elif operation.op == "setPosition":
        next_component["transform"]["position"] = operation.payload["position"]
    elif operation.op == "setScale":
        next_component["transform"]["scale"] = operation.payload["scale"]
    elif operation.op == "setRotation":
        next_component["transform"]["rotation"] = operation.payload["rotation"]

    return next_component


def _apply_operations_to_scene(scene: SceneState, operations: list[ValidatedOperation]) -> SceneState:
    components = [copy.deepcopy(component) for component in scene.components]
    component_indices = {component.get("id"): index for index, component in enumerate(components)}

    for operation in operations:
        if operation.target_id not in component_indices:
            component_indices[operation.target_id] = len(components)
            components.append(_default_scene_component(operation.target_id))
        index = component_indices[operation.target_id]
        components[index] = _apply_operation(components[index], operation)

    return SceneState(components=components)


def apply_operation_batch(db: sqlite3.Connection, project_id: str, batch: OperationBatch) -> tuple[Workspace, list[ValidatedOperation]]:
    current = get_workspace(db, project_id)
    validated = validate_operations(db, project_id, batch.operations, batch.source)
    created_at = now_iso()
    variant_id = f"variant_{int(created_at.replace('-', '').replace(':', '').replace('.', '').replace('Z', '').replace('T', ''))}"

    next_data = current.model_dump()
    next_data["scene"] = _apply_operations_to_scene(current.scene, validated).model_dump()
    next_data["current_variant_id"] = variant_id
    next_data["last_operations"] = [operation.model_dump() for operation in validated]
    next_data["has_unsaved_operations"] = True
    next_data["variant_history"] = [
        *[entry.model_dump() for entry in current.variant_history],
        VariantHistoryEntry(id=variant_id, label=batch.label or f"Manual edit {len(current.variant_history) + 1}", createdAt=created_at).model_dump(),
    ][-50:]
    next_data["history"] = {
        "past": [
            *[item.model_dump() for item in current.history.past],
            snapshot_workspace(current).model_dump(),
        ][-50:],
        "future": [],
    }
    next_data["updated_at"] = created_at

    workspace = Workspace.model_validate(next_data)
    return save_workspace(db, workspace), validated
