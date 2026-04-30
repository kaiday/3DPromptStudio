from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


InteractionKind = Literal["dialogue", "lesson", "hotspot", "trigger"]


class ComponentInteraction(CamelModel):
    id: str | None = None
    project_id: str | None = Field(default=None, alias="projectId")
    component_id: str | None = Field(default=None, alias="componentId")
    kind: InteractionKind
    label: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")

    @field_validator("component_id")
    @classmethod
    def validate_component_id(cls, value: str | None) -> str | None:
        if value is None:
            return value
        component_id = value.strip()
        if not component_id:
            raise ValueError("must not be empty")
        if len(component_id) > 160:
            raise ValueError("must be 160 characters or fewer")
        return component_id

    @field_validator("label")
    @classmethod
    def validate_label(cls, value: str) -> str:
        label = value.strip()
        if len(label) > 160:
            raise ValueError("must be 160 characters or fewer")
        return label


class ComponentInteractionsPayload(CamelModel):
    interactions: list[ComponentInteraction] = Field(default_factory=list)


class ComponentInteractionResponse(CamelModel):
    interaction: ComponentInteraction


class ComponentInteractionsResponse(CamelModel):
    interactions: list[ComponentInteraction] = Field(default_factory=list)
