from datetime import UTC, datetime
from math import pi
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AllowedOperation = Literal[
    "setColor",
    "setVisibility",
    "setMaterial",
    "setPosition",
    "setScale",
    "setRotation",
    "annotation",
    "line",
    "cut_annotation",
]

DEFAULT_ALLOWED_OPERATIONS: list[AllowedOperation] = [
    "setColor",
    "setVisibility",
    "setMaterial",
    "setPosition",
    "setScale",
    "setRotation",
    "annotation",
    "line",
    "cut_annotation",
]

OPERATION_ALIASES = {
    "colour": "setColor",
    "color": "setColor",
    "visibility": "setVisibility",
    "material": "setMaterial",
    "position": "setPosition",
    "scale": "setScale",
    "rotation": "setRotation",
}

CONFIG_FIELD_BY_OPERATION = {
    "setColor": {"operation": "setColor", "field": "color", "valueType": "hexColor", "label": "Colour"},
    "setMaterial": {"operation": "setMaterial", "field": "type", "valueType": "string", "label": "Material"},
    "setVisibility": {"operation": "setVisibility", "field": "visible", "valueType": "boolean", "label": "Visibility"},
    "setPosition": {"operation": "setPosition", "field": "position", "valueType": "vector3", "label": "Position"},
    "setScale": {"operation": "setScale", "field": "scale", "valueType": "vector3", "label": "Scale"},
    "setRotation": {"operation": "setRotation", "field": "rotation", "valueType": "vector3", "label": "Rotation"},
}


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class VectorBounds(CamelModel):
    min: list[float]
    max: list[float]

    @field_validator("min", "max")
    @classmethod
    def validate_vector3(cls, value: list[float]) -> list[float]:
        if len(value) != 3:
            raise ValueError("must be an array of three numbers")
        return value


class TransformBounds(CamelModel):
    position: VectorBounds = Field(default_factory=lambda: VectorBounds(min=[-5.0, -5.0, -5.0], max=[5.0, 5.0, 5.0]))
    scale: VectorBounds = Field(default_factory=lambda: VectorBounds(min=[0.05, 0.05, 0.05], max=[5.0, 5.0, 5.0]))
    rotation: VectorBounds = Field(default_factory=lambda: VectorBounds(min=[-pi, -pi, -pi], max=[pi, pi, pi]))


class OriginalSnapshot(CamelModel):
    position: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    rotation: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    scale: list[float] = Field(default_factory=lambda: [1.0, 1.0, 1.0])
    material_name: str = Field(default="", alias="materialName")
    color: str = ""
    visible: bool = True

    @field_validator("position", "rotation", "scale")
    @classmethod
    def validate_vector3(cls, value: list[float]) -> list[float]:
        if len(value) != 3:
            raise ValueError("must be an array of three numbers")
        return value

    @model_validator(mode="before")
    @classmethod
    def accept_colour_alias(cls, data):
        if isinstance(data, dict) and "colour" in data and "color" not in data:
            data = {**data, "color": data["colour"]}
        return data


class Component(CamelModel):
    id: str
    name: str | None = None
    mesh_name: str = Field(default="", alias="meshName")
    material_name: str = Field(default="", alias="materialName")
    editable: bool = True
    allowed_operations: list[AllowedOperation] = Field(default_factory=lambda: DEFAULT_ALLOWED_OPERATIONS.copy(), alias="allowedOperations")
    transform_bounds: TransformBounds = Field(default_factory=TransformBounds, alias="transformBounds")
    original_snapshot: OriginalSnapshot = Field(default_factory=OriginalSnapshot, alias="originalSnapshot")

    @field_validator("allowed_operations", mode="before")
    @classmethod
    def normalize_allowed_operations(cls, value):
        source = DEFAULT_ALLOWED_OPERATIONS if value is None else value
        normalized = []
        for operation in source:
            normalized_operation = OPERATION_ALIASES.get(operation, operation)
            if normalized_operation not in DEFAULT_ALLOWED_OPERATIONS:
                raise ValueError(f"Unsupported component operation: {operation}")
            if normalized_operation not in normalized:
                normalized.append(normalized_operation)
        return normalized

    @model_validator(mode="after")
    def fill_name(self) -> "Component":
        if not self.name:
            self.name = self.mesh_name or self.id
        return self


class ComponentRegistry(CamelModel):
    project_id: str = Field(alias="projectId")
    model_id: str | None = Field(default=None, alias="modelId")
    components: list[Component] = Field(default_factory=list)
    updated_at: str = Field(default_factory=now_iso, alias="updatedAt")


class ComponentRegistryPayload(CamelModel):
    model_id: str | None = Field(default=None, alias="modelId")
    components: list[Component] = Field(default_factory=list)


class ComponentConfig(CamelModel):
    project_id: str = Field(alias="projectId")
    part_id: str = Field(alias="partId")
    component: dict
    editable: bool
    editable_fields: list[dict] = Field(alias="editableFields")
    allowed_operations: list[AllowedOperation] = Field(alias="allowedOperations")
    transform_bounds: TransformBounds = Field(alias="transformBounds")


def default_registry(project_id: str) -> ComponentRegistry:
    return ComponentRegistry(projectId=project_id, components=[])


def build_component_config(project_id: str, component: Component) -> ComponentConfig:
    editable_fields = [
        CONFIG_FIELD_BY_OPERATION[operation]
        for operation in component.allowed_operations
        if operation in CONFIG_FIELD_BY_OPERATION
    ]
    return ComponentConfig(
        projectId=project_id,
        partId=component.id,
        component={
            "id": component.id,
            "name": component.name,
            "meshName": component.mesh_name,
            "materialName": component.material_name,
            "originalSnapshot": component.original_snapshot.model_dump(by_alias=True),
        },
        editable=component.editable,
        editableFields=editable_fields,
        allowedOperations=component.allowed_operations,
        transformBounds=component.transform_bounds,
    )
