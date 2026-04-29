from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

OperationType = Literal["setColor", "setVisibility", "setMaterial", "setPosition", "setScale", "setRotation"]


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class Operation(CamelModel):
    op: OperationType
    target_id: str = Field(alias="targetId")
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: str | None = None
    source: str | None = None

    @field_validator("target_id")
    @classmethod
    def validate_target_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("targetId is required")
        return value


class OperationBatch(CamelModel):
    operations: list[Operation]
    source: str = "config"
    label: str | None = None

    @field_validator("operations")
    @classmethod
    def validate_operations(cls, value: list[Operation]) -> list[Operation]:
        if not value:
            raise ValueError("operations must be a non-empty array")
        return value


class ValidatedOperation(Operation):
    timestamp: str = Field(default_factory=now_iso)

    @model_validator(mode="after")
    def ensure_timestamp(self) -> "ValidatedOperation":
        if not self.timestamp:
            self.timestamp = now_iso()
        return self
