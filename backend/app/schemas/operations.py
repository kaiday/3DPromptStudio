from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


OperationType = Literal["setColor", "setVisibility", "setMaterial", "setPosition", "setScale", "setRotation"]
OperationMode = Literal["preview", "apply"]


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class OperationTarget(CamelModel):
    component_id: str | None = Field(default=None, alias="componentId")
    part_id: str | None = Field(default=None, alias="partId")
    mesh_name: str | None = Field(default=None, alias="meshName")
    collection: str | None = None


class OperationSource(CamelModel):
    kind: Literal["manual", "prompt", "system", "import"] = "manual"
    prompt: str | None = None
    request_id: str | None = Field(default=None, alias="requestId")
    agent: str | None = None
    model: str | None = None


class SceneOperation(CamelModel):
    type: OperationType
    target: OperationTarget = Field(default_factory=OperationTarget)
    payload: dict[str, Any] = Field(default_factory=dict)
    source: OperationSource | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    requires_confirmation: bool = Field(default=False, alias="requiresConfirmation")

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_operation_shape(cls, data):
        if not isinstance(data, dict) or "type" in data:
            return data
        if "op" not in data:
            return data

        target_id = data.get("targetId") or data.get("target_id")
        normalized = {
            **data,
            "type": data["op"],
            "target": {"componentId": target_id} if target_id else {},
            "payload": data.get("payload", {}),
        }
        if "source" in data and isinstance(data["source"], str):
            source = data["source"]
            normalized["source"] = {
                "kind": source if source in {"manual", "prompt", "system", "import"} else "manual",
                "agent": source,
            }
        elif "source" not in data:
            normalized["source"] = {"kind": "manual"}
        return normalized


class ValidatedOperation(SceneOperation):
    id: str
    timestamp: str = Field(default_factory=now_iso)


class OperationBatchRequest(CamelModel):
    scene_id: str | None = Field(default=None, alias="sceneId")
    mode: OperationMode = "preview"
    base_revision_id: str | None = Field(default=None, alias="baseRevisionId")
    selected_component_id: str | None = Field(default=None, alias="selectedComponentId")
    operations: list[SceneOperation]

    @field_validator("operations")
    @classmethod
    def validate_operations(cls, value: list[SceneOperation]) -> list[SceneOperation]:
        if not value:
            raise ValueError("operations must be a non-empty array")
        if len(value) > 20:
            raise ValueError("operations cannot contain more than 20 items")
        return value


class OperationWarning(CamelModel):
    code: str
    message: str
    operation_index: int | None = Field(default=None, alias="operationIndex")
    details: dict[str, Any] = Field(default_factory=dict)


class OperationError(CamelModel):
    code: str
    message: str
    operation_index: int | None = Field(default=None, alias="operationIndex")
    target: dict[str, Any] | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class OperationBatchResponse(CamelModel):
    ok: bool = True
    mode: OperationMode = "preview"
    base_revision_id: str | None = Field(default=None, alias="baseRevisionId")
    revision_id: str | None = Field(default=None, alias="revisionId")
    operations: list[ValidatedOperation] = Field(default_factory=list)
    warnings: list[OperationWarning] = Field(default_factory=list)
    workspace: dict[str, Any] | None = None


class OperationErrorResponse(CamelModel):
    ok: bool = False
    error: OperationError
