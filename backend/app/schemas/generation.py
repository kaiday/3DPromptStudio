from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


GenerationJobStatus = Literal["queued", "running", "succeeded", "failed", "canceled"]
GenerationProvider = Literal["fake", "openai_blender", "hosted_blender"]
GenerationMode = Literal["asset"]
GenerationEventType = Literal[
    "job_queued",
    "job_started",
    "job_progress",
    "job_succeeded",
    "job_failed",
    "job_canceled",
]


class GenerationPlacement(CamelModel):
    position: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    rotation: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    scale: float = 1.0

    @field_validator("position", "rotation")
    @classmethod
    def validate_vector3(cls, value: list[float]) -> list[float]:
        if len(value) != 3:
            raise ValueError("must be an array of three numbers")
        return value

    @field_validator("scale")
    @classmethod
    def validate_scale(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("must be a positive number")
        return value


class GenerationJobCreate(CamelModel):
    prompt: str
    placement: GenerationPlacement = Field(default_factory=GenerationPlacement)
    style: str | None = None
    mode: GenerationMode = "asset"
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value: str) -> str:
        prompt = value.strip()
        if not prompt:
            raise ValueError("must not be empty")
        if len(prompt) > 500:
            raise ValueError("must be 500 characters or fewer")
        return prompt


class GenerationJobRecord(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    prompt: str
    status: GenerationJobStatus
    provider: GenerationProvider | str
    placement: GenerationPlacement
    style: str | None = None
    mode: GenerationMode = "asset"
    metadata: dict[str, Any] = Field(default_factory=dict)
    asset_id: str | None = Field(default=None, alias="assetId")
    model_url: str | None = Field(default=None, alias="modelUrl")
    metadata_url: str | None = Field(default=None, alias="metadataUrl")
    error_message: str | None = Field(default=None, alias="errorMessage")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    completed_at: str | None = Field(default=None, alias="completedAt")


class GenerationEventRecord(CamelModel):
    id: str
    job_id: str = Field(alias="jobId")
    project_id: str = Field(alias="projectId")
    type: GenerationEventType
    message: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(alias="createdAt")


class GenerationJobResponse(CamelModel):
    job: GenerationJobRecord


class GenerationJobsResponse(CamelModel):
    jobs: list[GenerationJobRecord]


class GenerationEventResponse(CamelModel):
    event: GenerationEventRecord


class GenerationEventsResponse(CamelModel):
    events: list[GenerationEventRecord]
