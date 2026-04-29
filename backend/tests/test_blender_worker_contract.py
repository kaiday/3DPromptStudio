from pathlib import Path
import json

import pytest

from app.workers.openai_blender_worker import (
    McpContentBlock,
    McpToolDefinition,
    OpenAIToolCall,
    OpenAIToolResult,
    OpenAIWorkerResponse,
    WorkerProgressEvent,
    WorkerRequest,
    WorkerResult,
    build_openai_blender_system_prompt,
    run_openai_blender_worker_loop,
    run_openai_blender_worker,
    validate_glb_file,
)
from app.core.mcp_client import McpClient, McpConnectionError, McpToolError, UnavailableMcpTransport
from app.services.blender_mcp_service import (
    BlenderMcpError,
    BlenderMcpService,
    format_mcp_result,
    mcp_tool_to_openai_tool,
    mcp_tools_to_openai_tools,
    short_json,
    to_openai_tool_result,
)
from app.services.openai_blender_generation_service import (
    OpenAIBlenderGenerationOptions,
    OpenAIBlenderGenerationService,
    generate_with_openai_blender,
)


class FakeMcpTransport:
    def __init__(self, *, tools=None, tool_results=None, on_call=None):
        self.connected = False
        self.closed = False
        self.list_tools_calls = 0
        self.tool_calls: list[tuple[str, dict]] = []
        self.tools = (
            [
                {
                    "name": "get_scene_info",
                    "description": "Inspect the current Blender scene.",
                    "inputSchema": {"type": "object", "properties": {"user_prompt": {"type": "string"}}},
                }
            ]
            if tools is None
            else tools
        )
        self.tool_results = tool_results or {}
        self.on_call = on_call

    async def connect(self):
        self.connected = True

    async def list_tools(self):
        self.list_tools_calls += 1
        return self.tools

    async def call_tool(self, name, arguments=None):
        self.tool_calls.append((name, arguments or {}))
        if self.on_call:
            self.on_call(name, arguments or {})
        return self.tool_results.get(name, {"content": [{"type": "text", "text": f"called {name}"}], "isError": False})

    async def close(self):
        self.closed = True


class FakeOpenAIAdapter:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls: list[dict] = []

    async def create_completion(self, *, messages, tools):
        self.calls.append({"messages": messages, "tools": tools})
        if not self.responses:
            return OpenAIWorkerResponse(content="done")
        return self.responses.pop(0)


def test_worker_request_normalizes_path_and_emits_progress_event(tmp_path: Path):
    events: list[WorkerProgressEvent] = []
    request = WorkerRequest(
        job_id="gen_123",
        project_id="project_abc",
        prompt="create a low-poly wizard",
        output_glb_path=tmp_path / "wizard.glb",
        metadata={"style": "low-poly"},
        progress_callback=events.append,
    )

    event = request.emit_progress("job_progress", "Preparing Blender workspace", {"step": 1})

    assert request.output_glb_path == tmp_path / "wizard.glb"
    assert request.provider == "openai_blender"
    assert request.metadata["style"] == "low-poly"
    assert event.type == "job_progress"
    assert event.message == "Preparing Blender workspace"
    assert events == [event]


def test_worker_request_rejects_missing_required_fields(tmp_path: Path):
    with pytest.raises(ValueError, match="job_id is required"):
        WorkerRequest(job_id="", project_id="project_abc", prompt="spawn tree", output_glb_path=tmp_path / "tree.glb")

    with pytest.raises(ValueError, match="project_id is required"):
        WorkerRequest(job_id="gen_123", project_id="", prompt="spawn tree", output_glb_path=tmp_path / "tree.glb")

    with pytest.raises(ValueError, match="prompt is required"):
        WorkerRequest(job_id="gen_123", project_id="project_abc", prompt=" ", output_glb_path=tmp_path / "tree.glb")


def test_worker_result_success_and_failure_contracts(tmp_path: Path):
    success = WorkerResult(
        job_id="gen_123",
        status="succeeded",
        output_glb_path=tmp_path / "wizard.glb",
        model_url="/api/projects/project_abc/models/gen_123.glb",
        asset_id="model_123",
    )

    assert success.output_glb_path == tmp_path / "wizard.glb"
    assert success.error_message is None

    failure = WorkerResult(job_id="gen_124", status="failed", error_message="Blender MCP unavailable")
    assert failure.status == "failed"
    assert failure.error_message == "Blender MCP unavailable"

    with pytest.raises(ValueError, match="failed worker results require error_message"):
        WorkerResult(job_id="gen_125", status="failed")

    with pytest.raises(ValueError, match="succeeded worker results cannot include error_message"):
        WorkerResult(job_id="gen_126", status="succeeded", error_message="unexpected")


def test_mcp_and_openai_tool_contracts_accept_required_shapes():
    tool = McpToolDefinition(
        name="get_scene_info",
        description="Inspect the current Blender scene.",
        input_schema={"type": "object", "properties": {"user_prompt": {"type": "string"}}},
    )
    image = McpContentBlock(type="image", data="base64-data", mime_type="image/png")
    call = OpenAIToolCall(id="call_123", name="get_scene_info", arguments={"user_prompt": "readiness check"})
    result = OpenAIToolResult(tool_call_id=call.id, content="Scene has 3 objects", images=[image])

    assert tool.name == "get_scene_info"
    assert tool.input_schema["type"] == "object"
    assert call.arguments["user_prompt"] == "readiness check"
    assert result.images[0].mime_type == "image/png"


def test_tool_contracts_reject_missing_identifiers():
    with pytest.raises(ValueError, match="MCP tool name is required"):
        McpToolDefinition(name="")

    with pytest.raises(ValueError, match="OpenAI tool call id is required"):
        OpenAIToolCall(id="", name="get_scene_info")

    with pytest.raises(ValueError, match="OpenAI tool call name is required"):
        OpenAIToolCall(id="call_123", name="")

    with pytest.raises(ValueError, match="OpenAI tool result call id is required"):
        OpenAIToolResult(tool_call_id="", content="ok")


def test_worker_placeholder_entrypoint_is_import_safe(tmp_path: Path):
    request = WorkerRequest(
        job_id="gen_123",
        project_id="project_abc",
        prompt="create a robot",
        output_glb_path=tmp_path / "robot.glb",
    )

    result = run_openai_blender_worker(request)

    assert result.job_id == "gen_123"
    assert result.status == "failed"
    assert "not implemented" in result.error_message


@pytest.mark.anyio
async def test_worker_loop_success_with_fake_adapters_and_early_glb_detection(tmp_path: Path):
    glb_path = tmp_path / "robot.glb"
    events: list[WorkerProgressEvent] = []

    def write_glb_on_export(name, arguments):
        if name == "export_scene":
            glb_path.write_bytes(b"0" * 1024)

    transport = FakeMcpTransport(
        tools=[
            {"name": "get_scene_info", "description": "Inspect scene", "inputSchema": {"type": "object"}},
            {"name": "export_scene", "description": "Export GLB", "inputSchema": {"type": "object"}},
        ],
        on_call=write_glb_on_export,
    )
    service = BlenderMcpService(McpClient(lambda: transport))
    adapter = FakeOpenAIAdapter(
        [
            OpenAIWorkerResponse(
                content="I will export the model.",
                tool_calls=[OpenAIToolCall(id="call_export", name="export_scene", arguments={"path": str(glb_path)})],
            )
        ]
    )
    request = WorkerRequest(
        job_id="gen_123",
        project_id="project_abc",
        prompt="create a robot",
        output_glb_path=glb_path,
        progress_callback=events.append,
    )

    result = await run_openai_blender_worker_loop(request, blender_service=service, openai_adapter=adapter)

    assert result.status == "succeeded"
    assert result.output_glb_path == glb_path
    assert result.metadata["sizeBytes"] == 1024
    assert transport.tool_calls[0][0] == "get_scene_info"
    assert transport.tool_calls[1] == ("export_scene", {"path": str(glb_path)})
    assert adapter.calls[0]["tools"][1]["function"]["name"] == "export_scene"
    assistant_tool_calls = adapter.calls[0]["messages"][2]["tool_calls"]
    assert json.loads(assistant_tool_calls[0]["function"]["arguments"]) == {"path": str(glb_path)}
    assert [event.type for event in events] == [
        "worker_started",
        "worker_progress",
        "worker_progress",
        "worker_tool_call",
        "worker_progress",
        "worker_succeeded",
    ]


@pytest.mark.anyio
async def test_worker_loop_returns_failure_when_mcp_unavailable(tmp_path: Path):
    events: list[WorkerProgressEvent] = []
    service = BlenderMcpService(McpClient(lambda: UnavailableMcpTransport("Blender is closed")))
    adapter = FakeOpenAIAdapter([])
    request = WorkerRequest(
        job_id="gen_123",
        project_id="project_abc",
        prompt="create a robot",
        output_glb_path=tmp_path / "robot.glb",
        progress_callback=events.append,
    )

    result = await run_openai_blender_worker_loop(request, blender_service=service, openai_adapter=adapter)

    assert result.status == "failed"
    assert "Blender MCP unavailable" in result.error_message
    assert len(adapter.calls) == 0
    assert events[-1].type == "worker_failed"


@pytest.mark.anyio
async def test_worker_loop_returns_failure_when_openai_reports_error(tmp_path: Path):
    service = BlenderMcpService(McpClient(lambda: FakeMcpTransport()))
    adapter = FakeOpenAIAdapter([OpenAIWorkerResponse(content="ERROR: cannot build requested object")])
    request = WorkerRequest(
        job_id="gen_123",
        project_id="project_abc",
        prompt="create a robot",
        output_glb_path=tmp_path / "robot.glb",
    )

    result = await run_openai_blender_worker_loop(request, blender_service=service, openai_adapter=adapter)

    assert result.status == "failed"
    assert result.error_message == "cannot build requested object"


@pytest.mark.anyio
async def test_worker_loop_returns_failure_when_glb_missing_after_finish(tmp_path: Path):
    service = BlenderMcpService(McpClient(lambda: FakeMcpTransport()))
    adapter = FakeOpenAIAdapter([OpenAIWorkerResponse(content="finished")])
    request = WorkerRequest(
        job_id="gen_123",
        project_id="project_abc",
        prompt="create a robot",
        output_glb_path=tmp_path / "robot.glb",
    )

    result = await run_openai_blender_worker_loop(request, blender_service=service, openai_adapter=adapter)

    assert result.status == "failed"
    assert "missing" in result.error_message


@pytest.mark.anyio
async def test_worker_loop_returns_failure_when_glb_is_undersized(tmp_path: Path):
    glb_path = tmp_path / "robot.glb"
    glb_path.write_bytes(b"tiny")
    service = BlenderMcpService(McpClient(lambda: FakeMcpTransport()))
    adapter = FakeOpenAIAdapter([OpenAIWorkerResponse(content="finished")])
    request = WorkerRequest(
        job_id="gen_123",
        project_id="project_abc",
        prompt="create a robot",
        output_glb_path=glb_path,
    )

    result = await run_openai_blender_worker_loop(request, blender_service=service, openai_adapter=adapter)

    assert result.status == "failed"
    assert "too small" in result.error_message


@pytest.mark.anyio
async def test_worker_loop_rejects_invalid_max_steps(tmp_path: Path):
    request = WorkerRequest(
        job_id="gen_123",
        project_id="project_abc",
        prompt="create a robot",
        output_glb_path=tmp_path / "robot.glb",
    )

    with pytest.raises(ValueError, match="max_steps must be greater than 0"):
        await run_openai_blender_worker_loop(
            request,
            blender_service=BlenderMcpService(McpClient(lambda: FakeMcpTransport())),
            openai_adapter=FakeOpenAIAdapter([]),
            max_steps=0,
        )


@pytest.mark.anyio
async def test_openai_blender_generation_service_facade_runs_worker(tmp_path: Path):
    glb_path = tmp_path / "robot.glb"

    def write_glb_on_export(name, arguments):
        if name == "export_scene":
            glb_path.write_bytes(b"0" * 1024)

    blender_service = BlenderMcpService(
        McpClient(
            lambda: FakeMcpTransport(
                tools=[
                    {"name": "get_scene_info", "description": "Inspect scene", "inputSchema": {"type": "object"}},
                    {"name": "export_scene", "description": "Export GLB", "inputSchema": {"type": "object"}},
                ],
                on_call=write_glb_on_export,
            )
        )
    )
    adapter = FakeOpenAIAdapter(
        [
            OpenAIWorkerResponse(
                content="exporting",
                tool_calls=[OpenAIToolCall(id="call_export", name="export_scene", arguments={"path": str(glb_path)})],
            )
        ]
    )
    service = OpenAIBlenderGenerationService(
        blender_service=blender_service,
        openai_adapter=adapter,
        options=OpenAIBlenderGenerationOptions(max_steps=2, min_glb_bytes=1024),
    )
    request = WorkerRequest(
        job_id="gen_123",
        project_id="project_abc",
        prompt="create a robot",
        output_glb_path=glb_path,
    )

    result = await service.generate(request)

    assert result.status == "succeeded"
    assert result.output_glb_path == glb_path


@pytest.mark.anyio
async def test_generate_with_openai_blender_function_uses_injected_dependencies(tmp_path: Path):
    glb_path = tmp_path / "robot.glb"
    glb_path.write_bytes(b"0" * 1024)
    request = WorkerRequest(
        job_id="gen_123",
        project_id="project_abc",
        prompt="create a robot",
        output_glb_path=glb_path,
    )
    blender_service = BlenderMcpService(McpClient(lambda: FakeMcpTransport()))
    adapter = FakeOpenAIAdapter([OpenAIWorkerResponse(content="finished")])

    result = await generate_with_openai_blender(
        request,
        blender_service=blender_service,
        openai_adapter=adapter,
        options=OpenAIBlenderGenerationOptions(max_steps=1),
    )

    assert result.status == "succeeded"
    assert len(adapter.calls) == 1


def test_openai_blender_generation_options_validate_values():
    with pytest.raises(ValueError, match="max_steps must be greater than 0"):
        OpenAIBlenderGenerationOptions(max_steps=0)

    with pytest.raises(ValueError, match="min_glb_bytes must be greater than 0"):
        OpenAIBlenderGenerationOptions(min_glb_bytes=0)


@pytest.mark.anyio
async def test_mcp_client_lists_tools_and_caches_results():
    transport = FakeMcpTransport()
    client = McpClient(lambda: transport)

    first = await client.list_tools()
    second = await client.list_tools()

    assert transport.connected is True
    assert transport.list_tools_calls == 1
    assert first == second
    assert first[0].name == "get_scene_info"
    assert first[0].input_schema["type"] == "object"


@pytest.mark.anyio
async def test_mcp_client_can_refresh_tools_and_call_tool():
    transport = FakeMcpTransport()
    client = McpClient(lambda: transport)

    await client.list_tools()
    refreshed = await client.list_tools(refresh=True)
    result = await client.call_tool("get_scene_info", {"user_prompt": "readiness check"})

    assert transport.list_tools_calls == 2
    assert refreshed[0].description == "Inspect the current Blender scene."
    assert result["content"][0]["text"] == "called get_scene_info"
    assert transport.tool_calls == [("get_scene_info", {"user_prompt": "readiness check"})]


@pytest.mark.anyio
async def test_mcp_client_close_resets_transport_and_tool_cache():
    transport = FakeMcpTransport()
    client = McpClient(lambda: transport)

    await client.list_tools()
    await client.close()

    assert transport.closed is True


@pytest.mark.anyio
async def test_mcp_client_wraps_unavailable_transport_as_typed_error():
    client = McpClient(lambda: UnavailableMcpTransport("Blender is not reachable"))

    with pytest.raises(McpConnectionError, match="Blender is not reachable"):
        await client.list_tools()


@pytest.mark.anyio
async def test_mcp_client_rejects_empty_tool_name():
    client = McpClient(lambda: FakeMcpTransport())

    with pytest.raises(McpToolError, match="MCP tool name is required"):
        await client.call_tool("")


def test_blender_mcp_result_formatting_extracts_text_and_images():
    result = format_mcp_result(
        {
            "content": [
                {"type": "text", "text": "Scene ready"},
                {"type": "image", "data": "base64-image", "mimeType": "image/png"},
                {"type": "unknown", "value": 1},
            ],
            "isError": False,
        }
    )

    assert "Scene ready" in result.text
    assert "[image attached]" in result.text
    assert result.images[0].data == "base64-image"
    assert result.images[0].mime_type == "image/png"
    assert result.is_error is False


def test_blender_mcp_result_formatting_marks_errors():
    result = format_mcp_result({"content": [{"type": "text", "text": "connection refused"}], "isError": True})

    assert result.is_error is True
    assert result.text.startswith("ERROR: connection refused")


def test_openai_tool_result_truncates_text_and_preserves_images():
    result = to_openai_tool_result(
        "call_123",
        {
            "content": [
                {"type": "text", "text": "x" * 20},
                {"type": "image", "data": "base64-image", "mimeType": "image/jpeg"},
            ]
        },
        max_text_chars=10,
    )

    assert result.tool_call_id == "call_123"
    assert result.content == "x" * 10
    assert result.images[0].mime_type == "image/jpeg"


def test_mcp_tool_to_openai_tool_preserves_schema_and_description():
    tool = McpToolDefinition(
        name="create_object",
        description="Create a Blender object.",
        input_schema={
            "type": "object",
            "properties": {
                "object_type": {"type": "string"},
                "location": {"type": "array", "items": {"type": "number"}},
            },
            "required": ["object_type"],
        },
    )

    openai_tool = mcp_tool_to_openai_tool(tool)

    assert openai_tool == {
        "type": "function",
        "function": {
            "name": "create_object",
            "description": "Create a Blender object.",
            "parameters": tool.input_schema,
        },
    }


def test_mcp_tool_to_openai_tool_falls_back_for_missing_schema_and_description():
    tool = McpToolDefinition(name="get_scene_info")

    openai_tool = mcp_tool_to_openai_tool(tool)

    assert openai_tool["type"] == "function"
    assert openai_tool["function"]["name"] == "get_scene_info"
    assert openai_tool["function"]["description"] == ""
    assert openai_tool["function"]["parameters"] == {"type": "object", "properties": {}}


def test_mcp_tools_to_openai_tools_preserves_order():
    tools = [
        McpToolDefinition(name="get_scene_info"),
        McpToolDefinition(name="create_object"),
        McpToolDefinition(name="export_scene"),
    ]

    openai_tools = mcp_tools_to_openai_tools(tools)

    assert [tool["function"]["name"] for tool in openai_tools] == [
        "get_scene_info",
        "create_object",
        "export_scene",
    ]


def test_openai_blender_prompt_builder_includes_generation_context(tmp_path: Path):
    request = WorkerRequest(
        job_id="gen_abc123",
        project_id="project_abc",
        prompt="spawn a low-poly wizard holding a lantern",
        output_glb_path=tmp_path / "gen_abc123.glb",
    )

    prompt = build_openai_blender_system_prompt(request)

    assert "spawn a low-poly wizard holding a lantern" in prompt
    assert "Job ID: gen_abc123" in prompt
    assert str(tmp_path / "gen_abc123.glb") in prompt


def test_openai_blender_prompt_builder_includes_hard_export_requirements(tmp_path: Path):
    request = WorkerRequest(
        job_id="gen_abc123",
        project_id="project_abc",
        prompt="create a robot",
        output_glb_path=tmp_path / "robot.glb",
    )

    prompt = build_openai_blender_system_prompt(request)

    assert "format='GLB'" in prompt
    assert "use_selection=True" in prompt
    assert "Center the exported model at the origin" in prompt
    assert "feet/base at Y=0" in prompt
    assert "face -Z" in prompt
    assert "Apply all transforms before export" in prompt
    assert "under 50,000 polygons" in prompt
    assert 'starting with "ERROR:"' in prompt


def test_openai_blender_prompt_builder_accepts_custom_template(tmp_path: Path):
    request = WorkerRequest(
        job_id="gen_abc123",
        project_id="project_abc",
        prompt="create a castle gate",
        output_glb_path=tmp_path / "gate.glb",
    )

    prompt = build_openai_blender_system_prompt(request, template="Custom scene request: {{prompt}}")

    assert prompt.startswith("Custom scene request: create a castle gate")
    assert "SERVER REQUIREMENTS:" in prompt


def test_glb_validation_reports_missing_file(tmp_path: Path):
    result = validate_glb_file(tmp_path / "missing.glb")

    assert result.ok is False
    assert result.path == tmp_path / "missing.glb"
    assert "missing" in result.error_message


def test_glb_validation_reports_directory_path(tmp_path: Path):
    result = validate_glb_file(tmp_path)

    assert result.ok is False
    assert "not a file" in result.error_message


def test_glb_validation_reports_undersized_file(tmp_path: Path):
    glb_path = tmp_path / "tiny.glb"
    glb_path.write_bytes(b"glb")

    result = validate_glb_file(glb_path, min_bytes=1024)

    assert result.ok is False
    assert result.size_bytes == 3
    assert "too small" in result.error_message


def test_glb_validation_accepts_valid_file(tmp_path: Path):
    glb_path = tmp_path / "valid.glb"
    glb_path.write_bytes(b"0" * 1024)

    result = validate_glb_file(glb_path)

    assert result.ok is True
    assert result.path == glb_path
    assert result.size_bytes == 1024
    assert result.error_message is None


def test_glb_validation_rejects_invalid_minimum(tmp_path: Path):
    with pytest.raises(ValueError, match="min_bytes must be greater than 0"):
        validate_glb_file(tmp_path / "valid.glb", min_bytes=0)


def test_short_json_compacts_and_truncates_payloads():
    compact = short_json({"b": 2, "a": 1})
    truncated = short_json({"prompt": "x" * 200}, max_chars=24)

    assert compact == '{"a":1,"b":2}'
    assert len(truncated) == 24
    assert truncated.endswith("...")


@pytest.mark.anyio
async def test_blender_mcp_service_readiness_check_succeeds():
    transport = FakeMcpTransport()
    service = BlenderMcpService(McpClient(lambda: transport))

    tools = await service.assert_ready()

    assert tools[0].name == "get_scene_info"
    assert transport.tool_calls == [("get_scene_info", {"user_prompt": "3DPromptStudio Blender readiness check"})]


@pytest.mark.anyio
async def test_blender_mcp_service_rejects_zero_tools():
    service = BlenderMcpService(McpClient(lambda: FakeMcpTransport(tools=[])))

    with pytest.raises(BlenderMcpError, match="zero tools"):
        await service.assert_ready()


@pytest.mark.anyio
async def test_blender_mcp_service_rejects_missing_readiness_tool():
    service = BlenderMcpService(McpClient(lambda: FakeMcpTransport(tools=[{"name": "create_object"}])))

    with pytest.raises(BlenderMcpError, match="missing required readiness tool"):
        await service.assert_ready()


@pytest.mark.anyio
async def test_blender_mcp_service_rejects_disconnected_readiness_result():
    service = BlenderMcpService(
        McpClient(
            lambda: FakeMcpTransport(
                tool_results={
                    "get_scene_info": {
                        "content": [{"type": "text", "text": "could not connect to Blender"}],
                        "isError": True,
                    }
                }
            )
        )
    )

    with pytest.raises(BlenderMcpError, match="not connected to Blender"):
        await service.assert_ready()
