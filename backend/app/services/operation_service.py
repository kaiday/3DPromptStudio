import copy
import math
import re
import sqlite3
from typing import Any

from app.schemas.components import Component, ComponentRegistry
from app.schemas.operations import (
    OperationBatchRequest,
    OperationBatchResponse,
    OperationError,
    SceneOperation,
    ValidatedOperation,
    now_iso,
)
from app.schemas.workspace import SceneState, VariantHistoryEntry, Workspace
from app.services.workspace_service import get_workspace, save_workspace, snapshot_workspace

HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
UNSAFE_MARKERS = [
    "import os",
    "subprocess",
    "eval(",
    "exec(",
    "__import__",
    "rm -rf",
    "powershell",
    "cmd.exe",
    "python:",
    "javascript:",
    "<script",
]


class OperationValidationError(ValueError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        operation_index: int | None = None,
        target: dict[str, Any] | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.error = OperationError(
            code=code,
            message=message,
            operationIndex=operation_index,
            target=target,
            details=details or {},
        )


def validate_operation_request(
    project_id: str,
    request: OperationBatchRequest,
    registry: ComponentRegistry,
    scene: SceneState | None = None,
) -> OperationBatchResponse:
    if registry.project_id != project_id:
        raise OperationValidationError(
            "REGISTRY_PROJECT_MISMATCH",
            "The component registry does not belong to this project.",
        )
    if not registry.components:
        raise OperationValidationError("EMPTY_REGISTRY", "The component registry has no components.")

    validated: list[ValidatedOperation] = []
    seen_properties: set[tuple[str, str]] = set()
    for index, operation in enumerate(request.operations):
        component = resolve_operation_target(operation, registry, index)
        validate_operation_allowed(operation, component, index)
        validate_payload(operation, component, index, scene)
        detect_unsafe_content(operation, index)

        key = (component.id, operation.type)
        if key in seen_properties:
            raise OperationValidationError(
                "CONFLICTING_OPERATIONS",
                "This request contains multiple operations for the same component property.",
                operation_index=index,
                target={"componentId": component.id},
            )
        seen_properties.add(key)

        validated.append(
            ValidatedOperation(
                id=f"op_{request.mode}_{index + 1}",
                type=operation.type,
                target=operation.target,
                payload=operation.payload,
                source=operation.source,
                confidence=operation.confidence,
                requiresConfirmation=operation.requires_confirmation,
            )
        )

    return OperationBatchResponse(
        ok=True,
        mode=request.mode,
        baseRevisionId=request.base_revision_id,
        operations=validated,
        warnings=[],
    )


def apply_operation_request(
    db: sqlite3.Connection,
    project_id: str,
    request: OperationBatchRequest,
    registry: ComponentRegistry,
) -> OperationBatchResponse:
    if request.mode != "apply":
        return validate_operation_request(project_id, request, registry)

    current = get_workspace(db, project_id)
    response = validate_operation_request(project_id, request, registry, current.scene)
    created_at = now_iso()
    revision_id = f"variant_{int(created_at.replace('-', '').replace(':', '').replace('.', '').replace('Z', '').replace('T', ''))}"

    next_data = current.model_dump()
    next_data["scene"] = apply_operations_to_scene(current.scene, response.operations).model_dump()
    next_data["current_variant_id"] = revision_id
    next_data["last_operations"] = [to_workspace_operation(operation) for operation in response.operations]
    next_data["ai_operation_history"] = [
        *current.ai_operation_history,
        *[
            to_ai_operation_history_entry(operation, revision_id)
            for operation in response.operations
        ],
    ][-50:]
    next_data["has_unsaved_operations"] = True
    next_data["variant_history"] = [
        *[entry.model_dump() for entry in current.variant_history],
        VariantHistoryEntry(id=revision_id, label=f"AI edit {len(current.variant_history) + 1}", createdAt=created_at).model_dump(),
    ][-50:]
    next_data["history"] = {
        "past": [
            *[item.model_dump() for item in current.history.past],
            snapshot_workspace(current).model_dump(),
        ][-50:],
        "future": [],
    }
    next_data["updated_at"] = created_at

    workspace = save_workspace(db, Workspace.model_validate(next_data))
    response.revision_id = revision_id
    response.workspace = workspace.model_dump(by_alias=True)
    return response


def resolve_operation_target(operation: SceneOperation, registry: ComponentRegistry, operation_index: int) -> Component:
    target = operation.target
    candidates: list[Component] = []

    if not any([target.component_id, target.part_id, target.mesh_name]):
        raise OperationValidationError(
            "TARGET_REQUIRED",
            "Operation target requires componentId, partId, or meshName.",
            operation_index=operation_index,
        )

    if target.component_id:
        candidates = [component for component in registry.components if component.id == target.component_id]
    elif target.part_id:
        candidates = [component for component in registry.components if component.id == target.part_id]
    elif target.mesh_name:
        candidates = [component for component in registry.components if component.mesh_name == target.mesh_name]

    if not candidates:
        raise OperationValidationError(
            "TARGET_NOT_FOUND",
            "No editable component matched the requested target.",
            operation_index=operation_index,
            target=target.model_dump(by_alias=True),
        )
    if len(candidates) > 1:
        raise OperationValidationError(
            "AMBIGUOUS_TARGET",
            "Multiple components matched the requested target.",
            operation_index=operation_index,
            target=target.model_dump(by_alias=True),
            details={"candidates": [component.id for component in candidates]},
        )
    return candidates[0]


def validate_operation_allowed(operation: SceneOperation, component: Component, operation_index: int) -> None:
    target = {"componentId": component.id}
    if not component.editable:
        raise OperationValidationError(
            "TARGET_NOT_EDITABLE",
            "The selected component cannot be edited.",
            operation_index=operation_index,
            target=target,
        )
    if operation.type not in component.allowed_operations:
        raise OperationValidationError(
            "OPERATION_NOT_ALLOWED",
            f"This component does not allow {operation.type}.",
            operation_index=operation_index,
            target=target,
            details={"allowedOperations": component.allowed_operations},
        )


def validate_payload(operation: SceneOperation, component: Component, operation_index: int, scene: SceneState | None = None) -> None:
    payload = operation.payload
    if operation.type == "setColor":
        validate_exact_keys(payload, {"color"}, operation_index)
        validate_hex_color(payload.get("color"), operation_index)
        return

    if operation.type == "setVisibility":
        validate_exact_keys(payload, {"visible"}, operation_index)
        if type(payload.get("visible")) is not bool:
            raise OperationValidationError("INVALID_BOOLEAN", "visible must be a boolean.", operation_index=operation_index)
        return

    if operation.type == "setMaterial":
        allowed = {"color", "roughness", "metalness", "opacity"}
        if not payload:
            raise OperationValidationError("INVALID_PAYLOAD", "setMaterial requires at least one field.", operation_index=operation_index)
        validate_allowed_keys(payload, allowed, operation_index)
        if "color" in payload:
            validate_hex_color(payload["color"], operation_index)
        for key in ("roughness", "metalness", "opacity"):
            if key in payload:
                validate_number_range(payload[key], 0.0, 1.0, operation_index, key)
        return

    if operation.type == "setPosition":
        validate_allowed_keys(payload, {"position", "mode"}, operation_index)
        vector = validate_vector(payload.get("position"), operation_index, "position")
        mode = payload.get("mode", "absolute")
        if mode not in {"absolute", "delta"}:
            raise OperationValidationError("INVALID_MODE", "setPosition mode must be absolute or delta.", operation_index=operation_index)
        current_position = get_current_transform_vector(scene, component.id, "position", component.original_snapshot.position)
        result = apply_vector_mode(current_position, vector, mode)
        validate_vector_bounds(result, component.transform_bounds.position.min, component.transform_bounds.position.max, operation_index, "position")
        return

    if operation.type == "setScale":
        validate_allowed_keys(payload, {"scale", "mode"}, operation_index)
        vector = validate_vector(payload.get("scale"), operation_index, "scale")
        if any(value <= 0 for value in vector):
            raise OperationValidationError("VALUE_OUT_OF_BOUNDS", "Scale values must be greater than zero.", operation_index=operation_index)
        mode = payload.get("mode", "absolute")
        if mode not in {"absolute", "multiply"}:
            raise OperationValidationError("INVALID_MODE", "setScale mode must be absolute or multiply.", operation_index=operation_index)
        current_scale = get_current_transform_vector(scene, component.id, "scale", component.original_snapshot.scale)
        result = multiply_vector(current_scale, vector) if mode == "multiply" else vector
        validate_vector_bounds(result, component.transform_bounds.scale.min, component.transform_bounds.scale.max, operation_index, "scale")
        return

    if operation.type == "setRotation":
        validate_allowed_keys(payload, {"rotation", "unit", "mode"}, operation_index)
        vector = validate_vector(payload.get("rotation"), operation_index, "rotation")
        mode = payload.get("mode", "absolute")
        unit = payload.get("unit", "degrees")
        if mode not in {"absolute", "delta"}:
            raise OperationValidationError("INVALID_MODE", "setRotation mode must be absolute or delta.", operation_index=operation_index)
        if unit not in {"degrees", "radians"}:
            raise OperationValidationError("INVALID_MODE", "setRotation unit must be degrees or radians.", operation_index=operation_index)
        max_abs = 360 if unit == "degrees" else math.tau
        if any(abs(value) > max_abs for value in vector):
            raise OperationValidationError("VALUE_OUT_OF_BOUNDS", "Rotation values are outside MVP bounds.", operation_index=operation_index)
        current_rotation = get_current_transform_vector(scene, component.id, "rotation", component.original_snapshot.rotation)
        result = apply_vector_mode(current_rotation, vector, mode)
        if unit == "degrees":
            result = [math.radians(value) for value in result]
        validate_vector_bounds(result, component.transform_bounds.rotation.min, component.transform_bounds.rotation.max, operation_index, "rotation")


def validate_exact_keys(payload: dict[str, Any], expected: set[str], operation_index: int) -> None:
    if set(payload.keys()) != expected:
        raise OperationValidationError("INVALID_PAYLOAD", f"Payload must contain only {sorted(expected)}.", operation_index=operation_index)


def validate_allowed_keys(payload: dict[str, Any], allowed: set[str], operation_index: int) -> None:
    unknown = set(payload.keys()) - allowed
    if unknown:
        raise OperationValidationError("INVALID_PAYLOAD", f"Unsupported payload fields: {sorted(unknown)}.", operation_index=operation_index)


def validate_hex_color(value: Any, operation_index: int) -> None:
    if not isinstance(value, str) or not HEX_COLOR_RE.match(value):
        raise OperationValidationError("INVALID_COLOR", "Color must be a #RRGGBB hex string.", operation_index=operation_index)


def validate_number_range(value: Any, minimum: float, maximum: float, operation_index: int, field: str) -> None:
    if not isinstance(value, int | float) or not math.isfinite(value) or not minimum <= float(value) <= maximum:
        raise OperationValidationError("VALUE_OUT_OF_BOUNDS", f"{field} must be between {minimum} and {maximum}.", operation_index=operation_index)


def validate_vector(value: Any, operation_index: int, field: str) -> list[float]:
    if not isinstance(value, list) or len(value) != 3:
        raise OperationValidationError("INVALID_VECTOR", f"{field} must be a three-number vector.", operation_index=operation_index)
    if not all(isinstance(item, int | float) and math.isfinite(item) for item in value):
        raise OperationValidationError("INVALID_VECTOR", f"{field} must contain finite numbers.", operation_index=operation_index)
    return [float(item) for item in value]


def validate_vector_bounds(vector: list[float], minimum: list[float], maximum: list[float], operation_index: int, field: str) -> None:
    for value, min_value, max_value in zip(vector, minimum, maximum, strict=True):
        if value < min_value or value > max_value:
            raise OperationValidationError("VALUE_OUT_OF_BOUNDS", f"{field} is outside component bounds.", operation_index=operation_index)


def apply_vector_mode(base: list[float], vector: list[float], mode: str) -> list[float]:
    if mode == "delta":
        return [base_value + value for base_value, value in zip(base, vector, strict=True)]
    return vector


def multiply_vector(base: list[float], vector: list[float]) -> list[float]:
    return [base_value * value for base_value, value in zip(base, vector, strict=True)]


def get_current_transform_vector(scene: SceneState | None, component_id: str, field: str, fallback: list[float]) -> list[float]:
    if scene:
        for component in scene.components:
            if component.get("id") != component_id:
                continue
            value = component.get("transform", {}).get(field)
            if isinstance(value, list) and len(value) == 3 and all(isinstance(item, int | float) and math.isfinite(item) for item in value):
                return [float(item) for item in value]
    return [float(item) for item in fallback]


def detect_unsafe_content(operation: SceneOperation, operation_index: int) -> None:
    values: list[str] = []
    if operation.source and operation.source.prompt:
        values.append(operation.source.prompt)
    for value in operation.payload.values():
        if isinstance(value, str):
            values.append(value)
    joined = "\n".join(values).lower()
    if any(marker in joined for marker in UNSAFE_MARKERS):
        raise OperationValidationError(
            "UNSAFE_CONTENT",
            "The operation contains unsupported executable-looking content.",
            operation_index=operation_index,
            target=operation.target.model_dump(by_alias=True),
        )


def apply_operations_to_scene(scene: SceneState, operations: list[ValidatedOperation]) -> SceneState:
    components = [copy.deepcopy(component) for component in scene.components]
    component_indices = {component.get("id"): index for index, component in enumerate(components)}

    for operation in operations:
        component_id = operation.target.component_id or operation.target.part_id or operation.target.mesh_name
        if not component_id:
            continue
        if component_id not in component_indices:
            component_indices[component_id] = len(components)
            components.append(default_scene_component(component_id))
        index = component_indices[component_id]
        components[index] = apply_operation_to_component(components[index], operation)

    return SceneState(components=components)


def default_scene_component(component_id: str) -> dict[str, Any]:
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


def apply_operation_to_component(component: dict[str, Any], operation: ValidatedOperation) -> dict[str, Any]:
    next_component = copy.deepcopy(component)
    next_component.setdefault("material", {})
    next_component.setdefault("transform", {})

    if operation.type == "setColor":
        next_component["material"]["color"] = operation.payload["color"]
    elif operation.type == "setMaterial":
        next_component["material"].update(operation.payload)
    elif operation.type == "setVisibility":
        next_component["visible"] = operation.payload["visible"]
    elif operation.type == "setPosition":
        current = ensure_vector(next_component["transform"].get("position"), [0.0, 0.0, 0.0])
        next_component["transform"]["position"] = transform_vector(current, operation.payload["position"], operation.payload.get("mode", "absolute"), "position")
    elif operation.type == "setScale":
        current = ensure_vector(next_component["transform"].get("scale"), [1.0, 1.0, 1.0])
        next_component["transform"]["scale"] = transform_vector(current, operation.payload["scale"], operation.payload.get("mode", "absolute"), "scale")
    elif operation.type == "setRotation":
        current = ensure_vector(next_component["transform"].get("rotation"), [0.0, 0.0, 0.0])
        next_component["transform"]["rotation"] = transform_vector(current, operation.payload["rotation"], operation.payload.get("mode", "absolute"), "rotation")

    return next_component


def ensure_vector(value: Any, fallback: list[float]) -> list[float]:
    if isinstance(value, list) and len(value) == 3 and all(isinstance(item, int | float) for item in value):
        return [float(item) for item in value]
    return fallback


def transform_vector(current: list[float], value: list[float], mode: str, field: str) -> list[float]:
    if mode == "delta":
        return [current_value + next_value for current_value, next_value in zip(current, value, strict=True)]
    if mode == "multiply" and field == "scale":
        return [current_value * next_value for current_value, next_value in zip(current, value, strict=True)]
    return [float(item) for item in value]


def to_workspace_operation(operation: ValidatedOperation) -> dict[str, Any]:
    target_id = operation.target.component_id or operation.target.part_id or operation.target.mesh_name
    source = None
    if operation.source:
        source = operation.source.kind
    return {
        "op": operation.type,
        "targetId": target_id,
        "payload": operation.payload,
        "timestamp": operation.timestamp,
        "source": source,
    }


def to_ai_operation_history_entry(operation: ValidatedOperation, revision_id: str) -> dict[str, Any]:
    data = operation.model_dump(by_alias=True)
    data["revisionId"] = revision_id
    return data
