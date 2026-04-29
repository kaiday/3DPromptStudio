from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.operations import OperationError, OperationMode, ValidatedOperation
from app.schemas.operations import SceneOperation


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class PromptInterpretRequest(CamelModel):
    scene_id: str | None = Field(default=None, alias="sceneId")
    prompt: str
    selected_component_id: str | None = Field(default=None, alias="selectedComponentId")
    mode: OperationMode = "preview"
    base_revision_id: str | None = Field(default=None, alias="baseRevisionId")

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value: str) -> str:
        prompt = value.strip()
        if not prompt:
            raise ValueError("prompt is required")
        if len(prompt) > 2000:
            raise ValueError("prompt cannot exceed 2000 characters")
        return prompt


class PromptInterpretResponse(CamelModel):
    ok: bool = True
    source: Literal["deterministic_fallback", "openai"] = "deterministic_fallback"
    operations: list[ValidatedOperation] = Field(default_factory=list)
    warnings: list[dict[str, Any]] = Field(default_factory=list)
    requires_clarification: bool = Field(default=False, alias="requiresClarification")
    requires_generation: bool = Field(default=False, alias="requiresGeneration")


class PromptErrorResponse(CamelModel):
    ok: bool = False
    source: Literal["deterministic_fallback", "openai"] = "deterministic_fallback"
    requires_clarification: bool = Field(default=False, alias="requiresClarification")
    requires_generation: bool = Field(default=False, alias="requiresGeneration")
    error: OperationError


class PromptOperationPlan(CamelModel):
    operations: list[SceneOperation] = Field(default_factory=list)
    requires_clarification: bool = Field(default=False, alias="requiresClarification")
    requires_generation: bool = Field(default=False, alias="requiresGeneration")
    message: str | None = None
