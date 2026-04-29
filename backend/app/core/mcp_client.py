from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.workers.openai_blender_worker import McpToolDefinition


class McpClientError(RuntimeError):
    """Base error for MCP client failures."""


class McpConnectionError(McpClientError):
    """Raised when the MCP client cannot connect or is unavailable."""


class McpToolError(McpClientError):
    """Raised when MCP tool listing or invocation fails."""


class McpTransport(Protocol):
    async def connect(self) -> None: ...

    async def list_tools(self) -> list[dict[str, Any]]: ...

    async def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]: ...

    async def close(self) -> None: ...


TransportFactory = Callable[[], McpTransport]


@dataclass
class McpClient:
    transport_factory: TransportFactory
    _transport: McpTransport | None = field(default=None, init=False, repr=False)
    _tools_cache: list[McpToolDefinition] | None = field(default=None, init=False, repr=False)

    async def connect(self) -> None:
        if self._transport is not None:
            return
        transport = self.transport_factory()
        try:
            await transport.connect()
        except McpClientError:
            raise
        except Exception as exc:
            raise McpConnectionError(f"Unable to connect to Blender MCP: {exc}") from exc
        self._transport = transport

    async def list_tools(self, *, refresh: bool = False) -> list[McpToolDefinition]:
        if self._tools_cache is not None and not refresh:
            return self._tools_cache
        transport = await self._require_transport()
        try:
            raw_tools = await transport.list_tools()
        except McpClientError:
            raise
        except Exception as exc:
            raise McpToolError(f"Unable to list Blender MCP tools: {exc}") from exc
        self._tools_cache = [_coerce_tool_definition(tool) for tool in raw_tools]
        return self._tools_cache

    async def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        if not name.strip():
            raise McpToolError("MCP tool name is required")
        transport = await self._require_transport()
        try:
            return await transport.call_tool(name, arguments or {})
        except McpClientError:
            raise
        except Exception as exc:
            raise McpToolError(f"Unable to call Blender MCP tool '{name}': {exc}") from exc

    async def close(self) -> None:
        transport = self._transport
        self._transport = None
        self._tools_cache = None
        if transport is None:
            return
        try:
            await transport.close()
        except McpClientError:
            raise
        except Exception as exc:
            raise McpConnectionError(f"Unable to close Blender MCP client: {exc}") from exc

    async def reset(self) -> None:
        await self.close()

    async def _require_transport(self) -> McpTransport:
        await self.connect()
        if self._transport is None:
            raise McpConnectionError("Blender MCP transport is not connected")
        return self._transport


def _coerce_tool_definition(raw_tool: dict[str, Any]) -> McpToolDefinition:
    name = str(raw_tool.get("name") or "")
    description = str(raw_tool.get("description") or "")
    input_schema = raw_tool.get("inputSchema") or raw_tool.get("input_schema") or {}
    if not isinstance(input_schema, dict):
        input_schema = {}
    return McpToolDefinition(name=name, description=description, input_schema=input_schema)


class UnavailableMcpTransport:
    def __init__(self, reason: str = "Blender MCP transport is not configured") -> None:
        self.reason = reason

    async def connect(self) -> None:
        raise McpConnectionError(self.reason)

    async def list_tools(self) -> list[dict[str, Any]]:
        raise McpConnectionError(self.reason)

    async def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        raise McpConnectionError(self.reason)

    async def close(self) -> None:
        return None


async def maybe_await(value: Any) -> Any:
    if isinstance(value, Awaitable):
        return await value
    return value
