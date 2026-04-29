from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class PromptRequest(CamelModel):
    prompt: str


class PromptContext(CamelModel):
    project_id: str = Field(alias="projectId")
    workspace_id: str = Field(alias="workspaceId")
    model_id: str | None = Field(alias="modelId")
    selected_part_id: str | None = Field(alias="selectedPartId")
    selected_tool: str = Field(alias="selectedTool")
    right_panel_mode: str = Field(alias="rightPanelMode")
    selected_component: dict[str, Any] | None = Field(alias="selectedComponent")
    components: list[dict[str, Any]]
    scene_components: list[dict[str, Any]] = Field(alias="sceneComponents")
    current_variant: dict[str, Any] = Field(alias="currentVariant")
    allowed_operations: list[str] = Field(alias="allowedOperations")
    constraints: dict[str, Any]
