import re
import sqlite3

from fastapi import HTTPException, status

from app.schemas.operations import Operation, OperationBatch
from app.schemas.prompts import PromptContext
from app.services.operation_service import apply_operation_batch

COLOR_WORDS = {
    "red": "#ef4444",
    "green": "#22c55e",
    "blue": "#3b82f6",
    "yellow": "#eab308",
    "black": "#111827",
    "white": "#f9fafb",
    "orange": "#f97316",
    "purple": "#a855f7",
    "gray": "#6b7280",
    "grey": "#6b7280",
}


def _normalize_text(value: str | None) -> str:
    return re.sub(r"[-_]+", " ", str(value or "").lower())


def _pick_color(prompt: str) -> str | None:
    lowered = _normalize_text(prompt)
    for word, color in COLOR_WORDS.items():
        if word in lowered.split() or word in lowered:
            return color
    return None


def _component_matches(component: dict, prompt: str) -> bool:
    lowered = _normalize_text(prompt)
    candidates = [
        _normalize_text(component.get("id")),
        _normalize_text(component.get("name")),
        _normalize_text(component.get("meshName")),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        if candidate in lowered:
            return True
        singular = candidate[:-1] if candidate.endswith("s") else candidate
        if len(singular) > 2 and singular in lowered:
            return True
    return False


def _resolve_target_ids(prompt: str, context: PromptContext) -> list[str]:
    lowered = _normalize_text(prompt)
    explicit_matches = [
        component["id"]
        for component in context.components
        if _component_matches(component, prompt)
    ]
    if explicit_matches:
        return sorted(set(explicit_matches))

    if context.selected_part_id and any(token in lowered for token in ["this", "selected", "part"]):
        return [context.selected_part_id]

    if "legs" in lowered or "leg" in lowered:
        leg_matches = [
            component["id"]
            for component in context.components
            if "leg" in _normalize_text(component.get("id")) or "leg" in _normalize_text(component.get("name"))
        ]
        if leg_matches:
            return sorted(set(leg_matches))

    if context.selected_part_id:
        return [context.selected_part_id]

    if context.components:
        return [context.components[0]["id"]]

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No editable parts are available for this model.")


def generate_operations(prompt: str, context: PromptContext) -> tuple[list[Operation], str]:
    if not prompt or not prompt.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="prompt is required.")

    target_ids = _resolve_target_ids(prompt, context)
    lowered = _normalize_text(prompt)
    operations: list[Operation] = []

    color = _pick_color(prompt)
    if color:
        operations.extend(
            Operation(op="setColor", targetId=target_id, payload={"color": color})
            for target_id in target_ids
        )

    if "hide" in lowered:
        operations.extend(
            Operation(op="setVisibility", targetId=target_id, payload={"visible": False})
            for target_id in target_ids
        )
    elif "show" in lowered:
        operations.extend(
            Operation(op="setVisibility", targetId=target_id, payload={"visible": True})
            for target_id in target_ids
        )

    if not operations:
        operations.extend(
            Operation(op="setMaterial", targetId=target_id, payload={"type": "standard"})
            for target_id in target_ids
        )

    return operations, "Deterministic prompt parser generated safe operations with workspace and component context."


def apply_prompt(db: sqlite3.Connection, project_id: str, prompt: str, context: PromptContext):
    operations, reasoning = generate_operations(prompt, context)
    batch = OperationBatch(operations=operations, source="prompt", label="Prompt edit")
    workspace, validated_operations = apply_operation_batch(db, project_id, batch)
    return workspace, validated_operations, reasoning
