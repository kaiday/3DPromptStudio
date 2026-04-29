from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings


def model_storage_root() -> Path:
    root = Path(get_settings().model_storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def create_model_id() -> str:
    return f"model_{uuid4().hex}"


def model_file_path(model_id: str) -> Path:
    return model_storage_root() / f"{model_id}.glb"


def write_model_file(model_id: str, content: bytes) -> Path:
    path = model_file_path(model_id)
    path.write_bytes(content)
    return path


def read_model_file_path(storage_path: str) -> Path:
    path = Path(storage_path)
    if not path.exists() or not path.is_file():
        raise FileNotFoundError("Model file is missing from storage.")
    return path
