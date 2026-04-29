from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


ExportMode = Literal["frontend_glb", "server_glb", "blender_worker"]
ExportStatus = Literal["recorded", "queued", "unsupported"]


class ExportRequestPayload(CamelModel):
    mode: ExportMode = "frontend_glb"
    include_annotations: bool = Field(default=False, alias="includeAnnotations")
    include_history: bool = Field(default=True, alias="includeHistory")
    include_scene_snapshot: bool = Field(default=True, alias="includeSceneSnapshot")
    format: Literal["glb"] = "glb"
    filename: str | None = None


class ExportRecord(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    model_id: str | None = Field(alias="modelId")
    current_variant_id: str | None = Field(alias="currentVariantId")
    status: ExportStatus
    mode: ExportMode
    options: dict[str, Any]
    message: str
    created_at: str = Field(alias="createdAt")
    worker_job: dict[str, Any] | None = Field(default=None, alias="workerJob")
    workspace_snapshot: dict[str, Any] | None = Field(default=None, alias="workspaceSnapshot")


class ExportResponse(CamelModel):
    export: ExportRecord
