from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


ModelSource = Literal["upload", "blender_worker"]


class ModelRecord(CamelModel):
    id: str
    project_id: str = Field(alias="projectId")
    original_filename: str = Field(alias="originalFilename")
    content_type: str = Field(alias="contentType")
    size_bytes: int = Field(alias="sizeBytes")
    source: ModelSource
    file_url: str = Field(alias="fileUrl")
    metadata_url: str = Field(alias="metadataUrl")
    created_at: str = Field(alias="createdAt")
    title: str | None = None


class ModelMetadata(CamelModel):
    model_id: str = Field(alias="modelId")
    project_id: str = Field(alias="projectId")
    original_filename: str = Field(alias="originalFilename")
    source: ModelSource
    size_bytes: int = Field(alias="sizeBytes")
    component_registry_status: str = Field(default="pending", alias="componentRegistryStatus")
    title: str | None = None


class StoredModel(CamelModel):
    record: ModelRecord
    storage_path: str = Field(alias="storagePath")
