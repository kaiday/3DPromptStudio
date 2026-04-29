from app.schemas.generation import GenerationJobCreate


def build_fake_generation_metadata(payload: GenerationJobCreate) -> dict:
    return {
        "placeholder": True,
        "prompt": payload.prompt,
        "style": payload.style,
        "mode": payload.mode,
        "metadata": payload.metadata,
    }
