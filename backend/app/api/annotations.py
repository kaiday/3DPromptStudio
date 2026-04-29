import sqlite3

from fastapi import APIRouter, Depends, Query, status

from app.db.session import get_db
from app.schemas.annotations import AnnotationCreate, AnnotationListResponse, AnnotationPatch, AnnotationResponse
from app.services.annotation_service import create_annotation, delete_annotation, list_annotations, update_annotation

router = APIRouter(prefix="/projects/{project_id}/annotations", tags=["annotations"])


@router.get("")
def get_annotations(
    project_id: str,
    status_filter: str | None = Query(default=None, alias="status"),
    part_id: str | None = Query(default=None, alias="partId"),
    variant_id: str | None = Query(default=None, alias="variantId"),
    annotation_type: str | None = Query(default=None, alias="type"),
    db: sqlite3.Connection = Depends(get_db),
) -> AnnotationListResponse:
    annotations = list_annotations(
        db,
        project_id,
        status_filter=status_filter,
        part_id=part_id,
        variant_id=variant_id,
        annotation_type=annotation_type,
    )
    return AnnotationListResponse(annotations=annotations)


@router.post("", status_code=status.HTTP_201_CREATED)
def post_annotation(project_id: str, payload: AnnotationCreate, db: sqlite3.Connection = Depends(get_db)) -> AnnotationResponse:
    annotation = create_annotation(db, project_id, payload)
    return AnnotationResponse(annotation=annotation)


@router.patch("/{annotation_id}")
def patch_annotation(
    project_id: str,
    annotation_id: str,
    payload: AnnotationPatch,
    db: sqlite3.Connection = Depends(get_db),
) -> AnnotationResponse:
    annotation = update_annotation(db, project_id, annotation_id, payload)
    return AnnotationResponse(annotation=annotation)


@router.delete("/{annotation_id}")
def remove_annotation(project_id: str, annotation_id: str, db: sqlite3.Connection = Depends(get_db)) -> AnnotationResponse:
    annotation = delete_annotation(db, project_id, annotation_id)
    return AnnotationResponse(annotation=annotation)
