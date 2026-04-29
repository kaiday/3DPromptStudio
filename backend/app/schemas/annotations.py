from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


AnnotationType = Literal["pin", "region", "freehand_note", "text_note", "cut_guide", "line"]
AnnotationTargetType = Literal["model", "component", "surface_point"]
AnnotationStatus = Literal["open", "resolved", "archived"]


class ScreenPosition(CamelModel):
    x: float
    y: float


class CutPlane(CamelModel):
    origin: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    normal: list[float] = Field(default_factory=lambda: [0.0, 1.0, 0.0])

    @field_validator("origin", "normal")
    @classmethod
    def validate_vector3(cls, value: list[float]) -> list[float]:
        if len(value) != 3:
            raise ValueError("must be an array of three numbers")
        return [float(item) for item in value]


class AnnotationBase(CamelModel):
    variant_id: str | None = Field(default=None, alias="variantId")
    part_id: str | None = Field(default=None, alias="partId")
    type: AnnotationType = "pin"
    target_type: AnnotationTargetType | None = Field(default=None, alias="targetType")
    position: list[float] | None = None
    normal: list[float] | None = None
    screen_position: ScreenPosition | None = Field(default=None, alias="screenPosition")
    points: list[list[float]] = Field(default_factory=list)
    screen_points: list[ScreenPosition] = Field(default_factory=list, alias="screenPoints")
    cut_plane: CutPlane | None = Field(default=None, alias="cutPlane")
    label: str = ""
    note: str = ""
    author_id: str = Field(default="anonymous", alias="authorId")
    session_id: str | None = Field(default=None, alias="sessionId")
    status: AnnotationStatus = "open"

    @field_validator("position", "normal")
    @classmethod
    def validate_optional_vector3(cls, value: list[float] | None) -> list[float] | None:
        if value is None:
            return None
        if len(value) != 3:
            raise ValueError("must be an array of three numbers")
        return [float(item) for item in value]

    @field_validator("points")
    @classmethod
    def validate_points(cls, value: list[list[float]]) -> list[list[float]]:
        for point in value:
            if len(point) != 3:
                raise ValueError("points must contain arrays of three numbers")
        return [[float(item) for item in point] for point in value]

    @model_validator(mode="after")
    def validate_annotation_shape(self) -> "AnnotationBase":
        if self.target_type is None:
            self.target_type = "component" if self.part_id else "model"

        if self.target_type == "component" and not self.part_id:
            raise ValueError("partId is required for component annotations.")

        if self.target_type == "surface_point" and self.position is None and self.screen_position is None:
            raise ValueError("surface_point annotations require position or screenPosition.")

        if self.type == "line" and len(self.points) < 2 and len(self.screen_points) < 2:
            raise ValueError("line annotations require at least two points or two screenPoints.")

        if self.type == "cut_guide" and len(self.points) < 2 and len(self.screen_points) < 2 and self.cut_plane is None:
            raise ValueError("cut_guide annotations require at least two points, two screenPoints, or a cutPlane.")

        return self


class AnnotationCreate(AnnotationBase):
    id: str | None = None


class AnnotationPatch(CamelModel):
    variant_id: str | None = Field(default=None, alias="variantId")
    part_id: str | None = Field(default=None, alias="partId")
    type: AnnotationType | None = None
    target_type: AnnotationTargetType | None = Field(default=None, alias="targetType")
    position: list[float] | None = None
    normal: list[float] | None = None
    screen_position: ScreenPosition | None = Field(default=None, alias="screenPosition")
    points: list[list[float]] | None = None
    screen_points: list[ScreenPosition] | None = Field(default=None, alias="screenPoints")
    cut_plane: CutPlane | None = Field(default=None, alias="cutPlane")
    label: str | None = None
    note: str | None = None
    author_id: str | None = Field(default=None, alias="authorId")
    session_id: str | None = Field(default=None, alias="sessionId")
    status: AnnotationStatus | None = None

    @field_validator("position", "normal")
    @classmethod
    def validate_optional_vector3(cls, value: list[float] | None) -> list[float] | None:
        if value is None:
            return None
        if len(value) != 3:
            raise ValueError("must be an array of three numbers")
        return [float(item) for item in value]

    @field_validator("points")
    @classmethod
    def validate_points(cls, value: list[list[float]] | None) -> list[list[float]] | None:
        if value is None:
            return None
        for point in value:
            if len(point) != 3:
                raise ValueError("points must contain arrays of three numbers")
        return [[float(item) for item in point] for point in value]


class AnnotationRecord(AnnotationBase):
    id: str = Field(default_factory=lambda: f"anno_{uuid4().hex}")
    project_id: str = Field(alias="projectId")
    target_type: AnnotationTargetType = Field(alias="targetType")
    created_at: str = Field(default_factory=now_iso, alias="createdAt")
    updated_at: str = Field(default_factory=now_iso, alias="updatedAt")


class AnnotationResponse(CamelModel):
    annotation: AnnotationRecord


class AnnotationListResponse(CamelModel):
    annotations: list[AnnotationRecord]
