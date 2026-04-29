import json
from dataclasses import dataclass, field
from typing import Any

from app.core.mcp_client import McpClient, McpConnectionError, McpToolError
from app.workers.openai_blender_worker import McpContentBlock, McpToolDefinition, OpenAIToolResult


READY_CHECK_TOOL = "get_scene_info"


class BlenderMcpError(RuntimeError):
    """Raised when Blender MCP reports an unusable state."""


@dataclass(frozen=True)
class FormattedMcpResult:
    text: str
    images: list[McpContentBlock] = field(default_factory=list)
    is_error: bool = False


@dataclass
class BlenderMcpService:
    client: McpClient
    readiness_tool: str = READY_CHECK_TOOL

    async def list_tools(self, *, refresh: bool = False) -> list[McpToolDefinition]:
        return await self.client.list_tools(refresh=refresh)

    async def assert_ready(self) -> list[McpToolDefinition]:
        tools = await self.list_tools()
        if not tools:
            raise BlenderMcpError("Blender MCP reported zero tools; confirm Blender and the MCP addon are running.")

        tool_names = {tool.name for tool in tools}
        if self.readiness_tool not in tool_names:
            raise BlenderMcpError(f"Blender MCP is missing required readiness tool '{self.readiness_tool}'.")

        try:
            result = await self.client.call_tool(
                self.readiness_tool,
                {"user_prompt": "3DPromptStudio Blender readiness check"},
            )
        except (McpConnectionError, McpToolError) as exc:
            raise BlenderMcpError(f"Blender MCP readiness check failed: {exc}") from exc

        formatted = format_mcp_result(result)
        if formatted.is_error or _looks_disconnected(formatted.text):
            raise BlenderMcpError(f"Blender MCP is not connected to Blender: {formatted.text[:300]}")
        return tools

    async def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> FormattedMcpResult:
        result = await self.client.call_tool(name, arguments or {})
        return format_mcp_result(result)


def format_mcp_result(result: dict[str, Any] | None) -> FormattedMcpResult:
    if not result:
        return FormattedMcpResult(text="null")

    is_error = bool(result.get("isError") or result.get("is_error"))
    content = result.get("content")
    if not isinstance(content, list):
        text = json.dumps(result, sort_keys=True)
        return FormattedMcpResult(text=f"ERROR: {text}" if is_error else text, is_error=is_error)

    text_parts: list[str] = []
    images: list[McpContentBlock] = []

    for block in content:
        if not isinstance(block, dict):
            text_parts.append(json.dumps(block))
            continue

        block_type = block.get("type")
        if block_type == "text":
            text_parts.append(str(block.get("text") or ""))
        elif block_type == "image":
            image = McpContentBlock(
                type="image",
                data=str(block.get("data") or ""),
                mime_type=str(block.get("mimeType") or block.get("mime_type") or "image/png"),
                raw=block,
            )
            images.append(image)
            text_parts.append("[image attached]")
        elif block_type == "resource":
            text_parts.append(json.dumps(block, sort_keys=True))
        else:
            text_parts.append(json.dumps(block, sort_keys=True))

    text = "\n".join(part for part in text_parts if part)
    if is_error:
        text = f"ERROR: {text}"
    return FormattedMcpResult(text=text, images=images, is_error=is_error)


def to_openai_tool_result(tool_call_id: str, result: dict[str, Any] | None, *, max_text_chars: int = 16000) -> OpenAIToolResult:
    formatted = format_mcp_result(result)
    return OpenAIToolResult(
        tool_call_id=tool_call_id,
        content=formatted.text[:max_text_chars],
        images=formatted.images,
        is_error=formatted.is_error,
    )


def mcp_tool_to_openai_tool(tool: McpToolDefinition) -> dict[str, Any]:
    parameters = tool.input_schema if isinstance(tool.input_schema, dict) and tool.input_schema else _empty_parameters_schema()
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description or "",
            "parameters": parameters,
        },
    }


def mcp_tools_to_openai_tools(tools: list[McpToolDefinition]) -> list[dict[str, Any]]:
    return [mcp_tool_to_openai_tool(tool) for tool in tools]


def short_json(value: Any, *, max_chars: int = 120) -> str:
    try:
        text = json.dumps(value, sort_keys=True, separators=(",", ":"))
    except TypeError:
        text = repr(value)
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3] + "..."


def _looks_disconnected(text: str) -> bool:
    return any(
        marker in text.lower()
        for marker in (
            "could not connect",
            "connection refused",
            "addon is running",
            "not connected",
        )
    )


def _empty_parameters_schema() -> dict[str, Any]:
    return {"type": "object", "properties": {}}
