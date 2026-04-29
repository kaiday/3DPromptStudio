from fastapi import FastAPI

from app.api.components import router as components_router
from app.api.health import router as health_router
from app.api.models import router as models_router
from app.api.operations import router as operations_router
from app.api.prompts import router as prompts_router
from app.api.workspace import router as workspace_router
from app.core.config import get_settings
from app.db.session import init_db


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)
    init_db()
    app.include_router(health_router, prefix="/api")
    app.include_router(components_router, prefix="/api")
    app.include_router(models_router, prefix="/api")
    app.include_router(operations_router, prefix="/api")
    app.include_router(prompts_router, prefix="/api")
    app.include_router(workspace_router, prefix="/api")
    return app


app = create_app()
