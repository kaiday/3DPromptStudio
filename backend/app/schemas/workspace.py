from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

WorkspaceTool = Literal["mouse", "annotation", "line", "cut", "zoom"]
RightPanelMode = Literal["config", "prompt"]

MAX_HISTORY_ITEMS = 50
DEFAULT_CAMERA_POSITION = [3.0, 2.2, 4.0]
DEFAULT_CAMERA_TARGET = [0.0, 0.8, 0.0]


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class VisibleHelpers(CamelModel):
    grid: bool = True
    ground: bool = True
    annotations: bool = True


class ViewportState(CamelModel):
    camera_position: list[float] = Field(default_factory=lambda: DEFAULT_CAMERA_POSITION.copy(), alias="cameraPosition")
    camera_target: list[float] = Field(default_factory=lambda: DEFAULT_CAMERA_TARGET.copy(), alias="cameraTarget")
    zoom: float = 1.0
    visible_helpers: VisibleHelpers = Field(default_factory=VisibleHelpers, alias="visibleHelpers")

    @field_validator("camera_position", "camera_target")
    @classmethod
    def validate_vector3(cls, value: list[float]) -> list[float]:
        if len(value) != 3:
            raise ValueError("must be an array of three numbers")
        return value

    @field_validator("zoom")
    @classmethod
    def validate_zoom(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("must be a positive number")
        return value


class SceneState(CamelModel):
    components: list[dict[str, Any]] = Field(default_factory=list)


class WorkspaceOperation(CamelModel):
    op: str
    target_id: str | None = Field(default=None, alias="targetId")
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(default_factory=now_iso)
    source: str | None = None


class PromptHistoryEntry(CamelModel):
    id: str
    prompt: str = ""
    created_at: str = Field(default_factory=now_iso, alias="createdAt")


class VariantHistoryEntry(CamelModel):
    id: str
    label: str = "Variant"
    created_at: str = Field(default_factory=now_iso, alias="createdAt")


class WorkspaceSnapshot(CamelModel):
    scene: SceneState = Field(default_factory=SceneState)
    selected_part_id: str | None = Field(default=None, alias="selectedPartId")
    selected_tool: WorkspaceTool = Field(default="mouse", alias="selectedTool")
    right_panel_mode: RightPanelMode = Field(default="config", alias="rightPanelMode")
    current_variant_id: str | None = Field(default=None, alias="currentVariantId")
    last_operations: list[WorkspaceOperation] = Field(default_factory=list, alias="lastOperations")
    ai_operation_history: list[dict[str, Any]] = Field(default_factory=list, alias="aiOperationHistory")


class WorkspaceHistory(CamelModel):
    past: list[WorkspaceSnapshot] = Field(default_factory=list)
    future: list[WorkspaceSnapshot] = Field(default_factory=list)

    @model_validator(mode="after")
    def limit_history(self) -> "WorkspaceHistory":
        self.past = self.past[-MAX_HISTORY_ITEMS:]
        self.future = self.future[-MAX_HISTORY_ITEMS:]
        return self


class Workspace(CamelModel):
    workspace_id: str = Field(alias="workspaceId")
    project_id: str = Field(alias="projectId")
    model_id: str | None = Field(default=None, alias="modelId")
    current_variant_id: str | None = Field(default=None, alias="currentVariantId")
    selected_tool: WorkspaceTool = Field(default="mouse", alias="selectedTool")
    selected_part_id: str | None = Field(default=None, alias="selectedPartId")
    right_panel_mode: RightPanelMode = Field(default="config", alias="rightPanelMode")
    viewport: ViewportState = Field(default_factory=ViewportState)
    scene: SceneState = Field(default_factory=SceneState)
    last_operations: list[WorkspaceOperation] = Field(default_factory=list, alias="lastOperations")
    ai_operation_history: list[dict[str, Any]] = Field(default_factory=list, alias="aiOperationHistory")
    prompt_history: list[PromptHistoryEntry] = Field(default_factory=list, alias="promptHistory")
    variant_history: list[VariantHistoryEntry] = Field(default_factory=list, alias="variantHistory")
    history: WorkspaceHistory = Field(default_factory=WorkspaceHistory)
    has_unsaved_operations: bool = Field(default=False, alias="hasUnsavedOperations")
    updated_at: str = Field(default_factory=now_iso, alias="updatedAt")

    @model_validator(mode="after")
    def limit_lists(self) -> "Workspace":
        self.last_operations = self.last_operations[-25:]
        self.ai_operation_history = self.ai_operation_history[-MAX_HISTORY_ITEMS:]
        self.prompt_history = self.prompt_history[-MAX_HISTORY_ITEMS:]
        self.variant_history = self.variant_history[-MAX_HISTORY_ITEMS:]
        return self


class ViewportPatch(CamelModel):
    camera_position: list[float] | None = Field(default=None, alias="cameraPosition")
    camera_target: list[float] | None = Field(default=None, alias="cameraTarget")
    zoom: float | None = None
    visible_helpers: dict[str, bool] | None = Field(default=None, alias="visibleHelpers")


class WorkspacePatch(CamelModel):
    model_id: str | None = Field(default=None, alias="modelId")
    current_variant_id: str | None = Field(default=None, alias="currentVariantId")
    selected_tool: WorkspaceTool | None = Field(default=None, alias="selectedTool")
    selected_part_id: str | None = Field(default=None, alias="selectedPartId")
    right_panel_mode: RightPanelMode | None = Field(default=None, alias="rightPanelMode")
    viewport: ViewportPatch | None = None
    scene: SceneState | None = None
    last_operations: list[WorkspaceOperation] | None = Field(default=None, alias="lastOperations")
    ai_operation_history: list[dict[str, Any]] | None = Field(default=None, alias="aiOperationHistory")
    prompt_history: list[PromptHistoryEntry] | None = Field(default=None, alias="promptHistory")
    variant_history: list[VariantHistoryEntry] | None = Field(default=None, alias="variantHistory")
    has_unsaved_operations: bool | None = Field(default=None, alias="hasUnsavedOperations")


def create_default_workspace(project_id: str) -> Workspace:
    return Workspace(workspaceId=f"workspace_{project_id}", projectId=project_id)


def snapshot_workspace(workspace: Workspace) -> WorkspaceSnapshot:
    return WorkspaceSnapshot(
        scene=workspace.scene,
        selectedPartId=workspace.selected_part_id,
        selectedTool=workspace.selected_tool,
        rightPanelMode=workspace.right_panel_mode,
        currentVariantId=workspace.current_variant_id,
        lastOperations=workspace.last_operations,
        aiOperationHistory=workspace.ai_operation_history,
    )
