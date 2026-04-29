import json
import re
from dataclasses import dataclass
import sqlite3
from typing import Any

from app.core.config import Settings, get_settings
from app.schemas.components import ComponentRegistry
from app.schemas.operations import OperationBatchRequest, OperationSource, OperationTarget, SceneOperation
from app.schemas.prompts import PromptInterpretRequest, PromptOperationPlan
from app.services.operation_service import OperationValidationError, apply_operation_request, validate_operation_request
from app.services.prompt_context_service import build_prompt_context
from app.services.workspace_service import get_workspace


COLOR_MAP = {
    "red": "#EF4444",
    "green": "#22C55E",
    "blue": "#2563EB",
    "yellow": "#FACC15",
    "orange": "#F97316",
    "purple": "#8B5CF6",
    "pink": "#EC4899",
    "black": "#111827",
    "white": "#F9FAFB",
    "gray": "#6B7280",
    "brown": "#92400E",
}

STRUCTURAL_PREFIXES = ("add ", "create ", "generate ", "make a new ", "build ", "insert ", "replace the scene")
SHORTCUT_TARGETS = {"this", "it", "selected", "current", ""}


@dataclass
class PatternMatch:
    operation_type: str
    target_text: str
    payload: dict[str, Any]


def interpret_prompt(
    project_id: str,
    request: PromptInterpretRequest,
    registry: ComponentRegistry,
    db: sqlite3.Connection | None = None,
    settings: Settings | None = None,
):
    active_settings = settings or get_settings()
    provider = active_settings.ai_prompt_provider.lower()
    workspace = get_workspace(db, project_id) if db is not None else None
    if provider == "openai":
        response = interpret_prompt_with_openai(project_id, request, registry, db, active_settings, workspace)
        return response, "openai"
    response = interpret_prompt_with_fallback(project_id, request, registry, db, workspace)
    return response, "deterministic_fallback"


def interpret_prompt_with_fallback(
    project_id: str,
    request: PromptInterpretRequest,
    registry: ComponentRegistry,
    db: sqlite3.Connection | None = None,
    workspace=None,
):
    selected_component_id = request.selected_component_id or (workspace.selected_part_id if workspace else None)
    context = build_prompt_context(registry, scene_id=request.scene_id, selected_component_id=selected_component_id, workspace=workspace)
    normalized = normalize_prompt(request.prompt)
    if contains_unsafe_content(normalized):
        raise OperationValidationError("UNSAFE_CONTENT", "The prompt contains unsupported executable-looking content.")
    if is_structural_prompt(normalized):
        raise OperationValidationError(
            "STRUCTURAL_EDIT_REQUIRES_GENERATION",
            "This request adds or regenerates scene content and should use the scene generation pipeline.",
        )

    match = match_operation_pattern(normalized)
    if not match:
        raise OperationValidationError(
            "UNSUPPORTED_PROMPT_INTENT",
            "The fallback parser does not support this edit request.",
        )

    component_ids, confidence = resolve_prompt_targets(match.target_text, context, selected_component_id)
    operations = [
        SceneOperation(
            type=match.operation_type,
            target=OperationTarget(componentId=component_id),
            payload=match.payload,
            source=OperationSource(kind="prompt", prompt=request.prompt, agent="deterministic_fallback", model="rules_v1"),
            confidence=confidence,
        )
        for component_id in component_ids
    ]
    batch = OperationBatchRequest(
        sceneId=request.scene_id,
        mode=request.mode,
        baseRevisionId=request.base_revision_id,
        selectedComponentId=selected_component_id,
        operations=operations,
    )
    if request.mode == "apply" and db is not None:
        return apply_operation_request(db, project_id, batch, registry)
    return validate_operation_request(project_id, batch, registry)


def interpret_prompt_with_openai(
    project_id: str,
    request: PromptInterpretRequest,
    registry: ComponentRegistry,
    db: sqlite3.Connection | None,
    settings: Settings,
    workspace=None,
):
    if not settings.openai_api_key:
        raise OperationValidationError(
            "OPENAI_API_KEY_REQUIRED",
            "AI_PROMPT_PROVIDER is openai, but OPENAI_API_KEY is not configured.",
        )

    selected_component_id = request.selected_component_id or (workspace.selected_part_id if workspace else None)
    context = build_prompt_context(registry, scene_id=request.scene_id, selected_component_id=selected_component_id, workspace=workspace)
    plan = create_openai_operation_plan(request.prompt, context, settings)
    if plan.requires_generation:
        raise OperationValidationError(
            "STRUCTURAL_EDIT_REQUIRES_GENERATION",
            plan.message or "This request adds or regenerates scene content and should use the scene generation pipeline.",
        )
    if plan.requires_clarification:
        raise OperationValidationError(
            "AMBIGUOUS_TARGET",
            plan.message or "The prompt requires clarification before an operation can be created.",
        )
    if not plan.operations:
        raise OperationValidationError("UNSUPPORTED_PROMPT_INTENT", "The model did not return any supported edit operations.")

    operations = [
        operation_with_prompt_source(operation, request.prompt, settings.openai_prompt_model)
        for operation in plan.operations
    ]
    batch = OperationBatchRequest(
        sceneId=request.scene_id,
        mode=request.mode,
        baseRevisionId=request.base_revision_id,
        selectedComponentId=selected_component_id,
        operations=operations,
    )
    if request.mode == "apply" and db is not None:
        return apply_operation_request(db, project_id, batch, registry)
    return validate_operation_request(project_id, batch, registry)


def create_openai_operation_plan(prompt: str, context: dict, settings: Settings) -> PromptOperationPlan:
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise OperationValidationError(
            "OPENAI_SDK_NOT_INSTALLED",
            "The OpenAI Python SDK is not installed.",
        ) from exc

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.responses.parse(
        model=settings.openai_prompt_model,
        input=[
            {
                "role": "system",
                "content": (
                    "Convert the user's 3D scene edit prompt into the provided structured operation schema. "
                    "Only target components listed in the context. Do not invent component IDs. "
                    "Use requiresGeneration for requests that add or regenerate scene content. "
                    "Use requiresClarification when the target or intent is ambiguous."
                ),
            },
            {
                "role": "user",
                "content": json.dumps({"prompt": prompt, "context": context}, separators=(",", ":")),
            },
        ],
        text_format=PromptOperationPlan,
    )
    return response.output_parsed


def operation_with_prompt_source(operation: SceneOperation, prompt: str, model: str) -> SceneOperation:
    if operation.source:
        return operation
    return SceneOperation(
        type=operation.type,
        target=operation.target,
        payload=operation.payload,
        source=OperationSource(kind="prompt", prompt=prompt, agent="openai", model=model),
        confidence=operation.confidence,
        requiresConfirmation=operation.requires_confirmation,
    )


def normalize_prompt(prompt: str) -> str:
    value = prompt.strip().lower()
    replacements = {
        "colour": "color",
        "grey": "gray",
        "larger": "bigger",
        "increase size": "bigger",
        "reduce size": "smaller",
        "shrink": "smaller",
        "turn": "rotate",
        "shift": "move",
        "to the left": "left",
        "to the right": "right",
        "upwards": "up",
        "downwards": "down",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    value = re.sub(r"[^\w\s#]", " ", value)
    for filler in ("please", "can you", "could you", "would you", "i want to", "make it so"):
        value = value.replace(filler, " ")
    return re.sub(r"\s+", " ", value).strip()


def contains_unsafe_content(prompt: str) -> bool:
    markers = ("import os", "subprocess", "eval(", "exec(", "__import__", "rm -rf", "powershell", "cmd.exe", "<script")
    return any(marker in prompt for marker in markers)


def is_structural_prompt(prompt: str) -> bool:
    return prompt.startswith(STRUCTURAL_PREFIXES)


def match_operation_pattern(prompt: str) -> PatternMatch | None:
    visibility = match_visibility(prompt)
    if visibility:
        return visibility
    movement = match_position(prompt)
    if movement:
        return movement
    rotation = match_rotation(prompt)
    if rotation:
        return rotation
    scale = match_scale(prompt)
    if scale:
        return scale
    color = match_color(prompt)
    if color:
        return color
    return None


def match_color(prompt: str) -> PatternMatch | None:
    color_names = "|".join(COLOR_MAP)
    patterns = [
        rf"^make (?P<target>.+) (?P<color>{color_names})$",
        rf"^change (?P<target>.+) to (?P<color>{color_names})$",
        rf"^set (?P<target>.+) to (?P<color>{color_names})$",
        rf"^color (?P<target>.+) (?P<color>{color_names})$",
    ]
    for pattern in patterns:
        match = re.match(pattern, prompt)
        if match:
            return PatternMatch("setColor", clean_target_text(match.group("target")), {"color": COLOR_MAP[match.group("color")]})
    return None


def match_visibility(prompt: str) -> PatternMatch | None:
    for prefix, visible in (("hide ", False), ("remove ", False), ("show ", True), ("unhide ", True)):
        if prompt.startswith(prefix):
            return PatternMatch("setVisibility", clean_target_text(prompt.removeprefix(prefix)), {"visible": visible})
    hidden = re.match(r"^make (?P<target>.+) hidden$", prompt)
    if hidden:
        return PatternMatch("setVisibility", clean_target_text(hidden.group("target")), {"visible": False})
    invisible = re.match(r"^make (?P<target>.+) invisible$", prompt)
    if invisible:
        return PatternMatch("setVisibility", clean_target_text(invisible.group("target")), {"visible": False})
    visible = re.match(r"^make (?P<target>.+) visible$", prompt)
    if visible:
        return PatternMatch("setVisibility", clean_target_text(visible.group("target")), {"visible": True})
    return None


def match_scale(prompt: str) -> PatternMatch | None:
    payloads = {
        "much bigger": {"scale": [1.5, 1.5, 1.5], "mode": "multiply"},
        "bigger": {"scale": [1.25, 1.25, 1.25], "mode": "multiply"},
        "much smaller": {"scale": [0.6, 0.6, 0.6], "mode": "multiply"},
        "smaller": {"scale": [0.8, 0.8, 0.8], "mode": "multiply"},
        "taller": {"scale": [1, 1.25, 1], "mode": "multiply"},
        "wider": {"scale": [1.25, 1, 1], "mode": "multiply"},
    }
    for phrase, payload in payloads.items():
        match = re.match(rf"^make (?P<target>.+) {phrase}$", prompt)
        if match:
            return PatternMatch("setScale", clean_target_text(match.group("target")), payload)
    return None


def match_position(prompt: str) -> PatternMatch | None:
    payloads = {
        "left": {"position": [-0.5, 0, 0], "mode": "delta"},
        "right": {"position": [0.5, 0, 0], "mode": "delta"},
        "up": {"position": [0, 0.5, 0], "mode": "delta"},
        "down": {"position": [0, -0.5, 0], "mode": "delta"},
        "forward": {"position": [0, 0, -0.5], "mode": "delta"},
        "back": {"position": [0, 0, 0.5], "mode": "delta"},
    }
    for direction, payload in payloads.items():
        match = re.match(rf"^move (?P<target>.+) {direction}$", prompt)
        if match:
            return PatternMatch("setPosition", clean_target_text(match.group("target")), payload)
    return None


def match_rotation(prompt: str) -> PatternMatch | None:
    patterns = {
        "rotate_left": (r"^rotate (?P<target>.+) left$", {"rotation": [0, 15, 0], "unit": "degrees", "mode": "delta"}),
        "rotate_right": (r"^rotate (?P<target>.+) right$", {"rotation": [0, -15, 0], "unit": "degrees", "mode": "delta"}),
        "tilt_up": (r"^tilt (?P<target>.+) up$", {"rotation": [15, 0, 0], "unit": "degrees", "mode": "delta"}),
        "tilt_down": (r"^tilt (?P<target>.+) down$", {"rotation": [-15, 0, 0], "unit": "degrees", "mode": "delta"}),
    }
    for pattern, payload in patterns.values():
        match = re.match(pattern, prompt)
        if match:
            return PatternMatch("setRotation", clean_target_text(match.group("target")), payload)
    return None


def clean_target_text(target_text: str) -> str:
    value = target_text.strip()
    if value in {"this", "it", "selected", "current"}:
        return value
    words = [word for word in value.split() if word not in {"the", "a", "an", "object", "part", "component", "mesh"}]
    return " ".join(words).strip()


def resolve_prompt_targets(target_text: str, context: dict, selected_component_id: str | None) -> tuple[list[str], float]:
    if target_text in SHORTCUT_TARGETS:
        if not selected_component_id:
            raise OperationValidationError("TARGET_REQUIRED", "This prompt needs a selected component.")
        return [selected_component_id], 1.0

    grouped = resolve_grouped_targets(target_text, context)
    if grouped:
        return grouped, 0.8

    scored: list[tuple[int, str]] = []
    for component in context["components"]:
        score = score_component_match(target_text, component)
        if score:
            scored.append((score, component["id"]))

    if not scored:
        raise OperationValidationError("TARGET_NOT_FOUND", "No editable component matched the prompt target.")

    scored.sort(reverse=True)
    best_score = scored[0][0]
    candidates = [component_id for score, component_id in scored if score == best_score]
    if len(candidates) > 1:
        raise OperationValidationError(
            "AMBIGUOUS_TARGET",
            "Multiple editable components matched the prompt target.",
            details={"candidates": candidates},
        )
    return [candidates[0]], best_score / 100


def resolve_grouped_targets(target_text: str, context: dict) -> list[str]:
    if target_text not in {"leg", "legs"}:
        return []
    matches = [
        component["id"]
        for component in context["components"]
        if "leg" in component["id"].replace("_", " ").lower()
        or "leg" in (component.get("name") or "").lower()
        or any("leg" in tag for tag in component.get("tags", []))
    ]
    return sorted(set(matches))


def score_component_match(target_text: str, component: dict) -> int:
    target = target_text.lower()
    component_id_text = component["id"].replace("_", " ").lower()
    name = (component.get("name") or "").lower()
    tags = [tag.lower() for tag in component.get("tags", [])]
    component_type = (component.get("type") or "").lower()

    if target == component_id_text or target == component["id"].lower():
        return 95
    if target == name:
        return 90
    if target in tags:
        return 80
    if name and target in name:
        return 70
    if any(target in tag for tag in tags):
        return 65
    if target == component_type:
        return 50
    return 0
