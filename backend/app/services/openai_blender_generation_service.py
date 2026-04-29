from dataclasses import dataclass

from app.services.blender_mcp_service import BlenderMcpService
from app.workers.openai_blender_worker import (
    DEFAULT_MIN_GLB_BYTES,
    OpenAIWorkerAdapter,
    WorkerRequest,
    WorkerResult,
    run_openai_blender_worker_loop,
)


@dataclass(frozen=True)
class OpenAIBlenderGenerationOptions:
    max_steps: int = 80
    min_glb_bytes: int = DEFAULT_MIN_GLB_BYTES

    def __post_init__(self) -> None:
        if self.max_steps < 1:
            raise ValueError("max_steps must be greater than 0")
        if self.min_glb_bytes < 1:
            raise ValueError("min_glb_bytes must be greater than 0")


@dataclass
class OpenAIBlenderGenerationService:
    blender_service: BlenderMcpService
    openai_adapter: OpenAIWorkerAdapter
    options: OpenAIBlenderGenerationOptions = OpenAIBlenderGenerationOptions()

    async def generate(self, request: WorkerRequest) -> WorkerResult:
        return await run_openai_blender_worker_loop(
            request,
            blender_service=self.blender_service,
            openai_adapter=self.openai_adapter,
            max_steps=self.options.max_steps,
            min_glb_bytes=self.options.min_glb_bytes,
        )


async def generate_with_openai_blender(
    request: WorkerRequest,
    *,
    blender_service: BlenderMcpService,
    openai_adapter: OpenAIWorkerAdapter,
    options: OpenAIBlenderGenerationOptions | None = None,
) -> WorkerResult:
    service = OpenAIBlenderGenerationService(
        blender_service=blender_service,
        openai_adapter=openai_adapter,
        options=options or OpenAIBlenderGenerationOptions(),
    )
    return await service.generate(request)
