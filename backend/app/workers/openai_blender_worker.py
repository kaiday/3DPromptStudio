from collections.abc import Callable
from dataclasses import dataclass, field
import json
from pathlib import Path
from typing import Any, Literal, Protocol


DEFAULT_SYSTEM_PROMPT_TEMPLATE = """Create exactly the requested 3D asset.

The request may be a character, vehicle, prop, building, creature, group, or abstract object.
Do not default to a humanoid or statue when the prompt asks for something else.
Use the prompt as the main specification and preserve the visual style requested by the user.

Request: {{prompt}}
"""

SERVER_REQUIREMENTS_TEMPLATE = """
SERVER REQUIREMENTS:
- Job ID: {{job_id}}
- Export the newly created or positioned object as a GLB file to exactly this absolute path:
  {{output_glb_path}}
- Center the exported model at the origin.
- Place the feet/base at Y=0.
- Make the model face -Z.
- Apply all transforms before export.
- If the import or build creates multiple objects, parent/group the complete hierarchy and select every visible mesh, armature, or empty that belongs to the requested model before export.
- Use Blender GLTF export with format='GLB' and use_selection=True so only the requested model is exported.
- Do not delete unrelated scene objects; they may be reused by future requests.
- Keep the exported model under 50,000 polygons.
- After the GLB file exists at the required path, stop making tool calls and return a brief success summary.
- If you cannot fulfil the request, return a short message starting with "ERROR:" that explains why.
"""

DEFAULT_MIN_GLB_BYTES = 1024

ProgressCallback = Callable[["WorkerProgressEvent"], None]

WorkerProvider = Literal["openai_blender"]
WorkerStatus = Literal["queued", "running", "succeeded", "failed", "canceled"]
ProgressLevel = Literal["info", "warning", "error"]
McpContentType = Literal["text", "image", "resource", "unknown"]


@dataclass(frozen=True)
class WorkerProgressEvent:
    type: str
    message: str = ""
    payload: dict[str, Any] = field(default_factory=dict)
    level: ProgressLevel = "info"


@dataclass(frozen=True)
class WorkerRequest:
    job_id: str
    project_id: str
    prompt: str
    output_glb_path: Path
    provider: WorkerProvider = "openai_blender"
    metadata: dict[str, Any] = field(default_factory=dict)
    progress_callback: ProgressCallback | None = field(default=None, repr=False, compare=False)

    def __post_init__(self) -> None:
        if not self.job_id.strip():
            raise ValueError("job_id is required")
        if not self.project_id.strip():
            raise ValueError("project_id is required")
        if not self.prompt.strip():
            raise ValueError("prompt is required")
        object.__setattr__(self, "output_glb_path", Path(self.output_glb_path))

    def emit_progress(
        self,
        event_type: str,
        message: str = "",
        payload: dict[str, Any] | None = None,
        level: ProgressLevel = "info",
    ) -> WorkerProgressEvent:
        event = WorkerProgressEvent(
            type=event_type,
            message=message,
            payload=payload or {},
            level=level,
        )
        if self.progress_callback:
            self.progress_callback(event)
        return event


@dataclass(frozen=True)
class WorkerResult:
    job_id: str
    status: WorkerStatus
    output_glb_path: Path | None = None
    model_url: str | None = None
    asset_id: str | None = None
    error_message: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.job_id.strip():
            raise ValueError("job_id is required")
        if self.output_glb_path is not None:
            object.__setattr__(self, "output_glb_path", Path(self.output_glb_path))
        if self.status == "failed" and not self.error_message:
            raise ValueError("failed worker results require error_message")
        if self.status == "succeeded" and self.error_message:
            raise ValueError("succeeded worker results cannot include error_message")


@dataclass(frozen=True)
class McpToolDefinition:
    name: str
    description: str = ""
    input_schema: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValueError("MCP tool name is required")


@dataclass(frozen=True)
class McpContentBlock:
    type: McpContentType
    text: str | None = None
    data: str | None = None
    mime_type: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class OpenAIToolCall:
    id: str
    name: str
    arguments: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.id.strip():
            raise ValueError("OpenAI tool call id is required")
        if not self.name.strip():
            raise ValueError("OpenAI tool call name is required")


@dataclass(frozen=True)
class OpenAIToolResult:
    tool_call_id: str
    content: str
    images: list[McpContentBlock] = field(default_factory=list)
    is_error: bool = False

    def __post_init__(self) -> None:
        if not self.tool_call_id.strip():
            raise ValueError("OpenAI tool result call id is required")


@dataclass(frozen=True)
class OpenAIWorkerResponse:
    content: str = ""
    tool_calls: list[OpenAIToolCall] = field(default_factory=list)


class OpenAIWorkerAdapter(Protocol):
    async def create_completion(
        self,
        *,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> OpenAIWorkerResponse: ...


@dataclass(frozen=True)
class GlbValidationResult:
    ok: bool
    path: Path
    size_bytes: int = 0
    error_message: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "path", Path(self.path))
        if self.ok and self.error_message:
            raise ValueError("valid GLB results cannot include error_message")
        if not self.ok and not self.error_message:
            raise ValueError("invalid GLB results require error_message")


def build_openai_blender_system_prompt(
    request: WorkerRequest,
    *,
    template: str = DEFAULT_SYSTEM_PROMPT_TEMPLATE,
) -> str:
    prompt_text = template.replace("{{prompt}}", request.prompt)
    requirements = (
        SERVER_REQUIREMENTS_TEMPLATE.replace("{{job_id}}", request.job_id)
        .replace("{{output_glb_path}}", str(request.output_glb_path))
        .strip()
    )
    return f"{prompt_text.rstrip()}\n\n{requirements}"


def validate_glb_file(path: Path | str, *, min_bytes: int = DEFAULT_MIN_GLB_BYTES) -> GlbValidationResult:
    glb_path = Path(path)
    if min_bytes < 1:
        raise ValueError("min_bytes must be greater than 0")
    if not glb_path.exists():
        return GlbValidationResult(ok=False, path=glb_path, error_message=f"Generated GLB is missing: {glb_path}")
    if not glb_path.is_file():
        return GlbValidationResult(ok=False, path=glb_path, error_message=f"Generated GLB path is not a file: {glb_path}")

    size_bytes = glb_path.stat().st_size
    if size_bytes < min_bytes:
        return GlbValidationResult(
            ok=False,
            path=glb_path,
            size_bytes=size_bytes,
            error_message=f"Generated GLB is too small ({size_bytes} bytes, minimum {min_bytes} bytes): {glb_path}",
        )
    return GlbValidationResult(ok=True, path=glb_path, size_bytes=size_bytes)


async def run_openai_blender_worker_loop(
    request: WorkerRequest,
    *,
    blender_service: Any,
    openai_adapter: OpenAIWorkerAdapter,
    max_steps: int = 80,
    min_glb_bytes: int = DEFAULT_MIN_GLB_BYTES,
) -> WorkerResult:
    from app.services.blender_mcp_service import mcp_tools_to_openai_tools, short_json

    if max_steps < 1:
        raise ValueError("max_steps must be greater than 0")

    request.emit_progress("worker_started", "Connecting to Blender MCP")
    try:
        mcp_tools = await blender_service.assert_ready()
    except Exception as exc:
        message = f"Blender MCP unavailable: {exc}"
        request.emit_progress("worker_failed", message, level="error")
        return WorkerResult(job_id=request.job_id, status="failed", error_message=message)

    openai_tools = mcp_tools_to_openai_tools(mcp_tools)
    request.emit_progress("worker_progress", f"MCP ready with {len(openai_tools)} tools")

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": build_openai_blender_system_prompt(request)},
        {"role": "user", "content": f"Build the requested 3D asset now: {request.prompt}"},
    ]

    for step in range(max_steps):
        request.emit_progress(
            "worker_progress",
            f"OpenAI generation step {step + 1}/{max_steps}",
            {"step": step + 1, "maxSteps": max_steps},
        )

        response = await openai_adapter.create_completion(messages=messages, tools=openai_tools)
        assistant_message = _assistant_message_from_response(response)
        messages.append(assistant_message)

        if not response.tool_calls:
            content = response.content.strip()
            if content.startswith("ERROR:"):
                message = content.removeprefix("ERROR:").strip() or "OpenAI Blender worker reported an error"
                request.emit_progress("worker_failed", message, level="error")
                return WorkerResult(job_id=request.job_id, status="failed", error_message=message)
            request.emit_progress("worker_progress", content or "OpenAI worker finished without tool calls")
            validation = validate_glb_file(request.output_glb_path, min_bytes=min_glb_bytes)
            if validation.ok:
                return _success_result(request, validation)
            request.emit_progress("worker_failed", validation.error_message or "Generated GLB is invalid", level="error")
            return WorkerResult(job_id=request.job_id, status="failed", error_message=validation.error_message)

        for tool_call in response.tool_calls:
            request.emit_progress(
                "worker_tool_call",
                f"{tool_call.name}({short_json(tool_call.arguments)})",
                {"toolName": tool_call.name, "toolCallId": tool_call.id},
            )
            try:
                tool_result = await blender_service.call_tool(tool_call.name, tool_call.arguments)
            except Exception as exc:
                content = f"ERROR: {exc}"
                is_error = True
                images = []
            else:
                content = tool_result.text
                is_error = tool_result.is_error
                images = tool_result.images

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": content[:16000],
                    "is_error": is_error,
                }
            )
            if images:
                messages.append(
                    {
                        "role": "user",
                        "content": f"Images returned by {tool_call.name}: {len(images)} image(s).",
                    }
                )

            validation = validate_glb_file(request.output_glb_path, min_bytes=min_glb_bytes)
            if validation.ok:
                request.emit_progress("worker_progress", "Generated GLB detected on disk")
                return _success_result(request, validation)

    validation = validate_glb_file(request.output_glb_path, min_bytes=min_glb_bytes)
    if validation.ok:
        return _success_result(request, validation)

    message = f"OpenAI Blender worker reached max steps without a valid GLB: {validation.error_message}"
    request.emit_progress("worker_failed", message, level="error")
    return WorkerResult(job_id=request.job_id, status="failed", error_message=message)


def run_openai_blender_worker(request: WorkerRequest) -> WorkerResult:
    """Placeholder worker entrypoint until the loop skeleton is implemented."""
    request.emit_progress("worker_not_implemented", "OpenAI Blender worker loop is not implemented yet.", level="warning")
    return WorkerResult(
        job_id=request.job_id,
        status="failed",
        error_message="OpenAI Blender worker loop is not implemented yet.",
    )


def _assistant_message_from_response(response: OpenAIWorkerResponse) -> dict[str, Any]:
    message: dict[str, Any] = {"role": "assistant", "content": response.content}
    if response.tool_calls:
        message["tool_calls"] = [
            {"id": call.id, "function": {"name": call.name, "arguments": json.dumps(call.arguments)}} for call in response.tool_calls
        ]
    return message


def _success_result(request: WorkerRequest, validation: GlbValidationResult) -> WorkerResult:
    request.emit_progress(
        "worker_succeeded",
        "Generated GLB validated",
        {"path": str(validation.path), "sizeBytes": validation.size_bytes},
    )
    return WorkerResult(
        job_id=request.job_id,
        status="succeeded",
        output_glb_path=validation.path,
        metadata={"sizeBytes": validation.size_bytes},
    )
