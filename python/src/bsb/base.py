from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from .observable import ObservableBackend, Trace
from .schema import Schema


class BSBError(Exception):
    pass


class BSBValidationError(BSBError):
    pass


def _normalize_payload(args: tuple[Any, ...]) -> Any:
    if len(args) == 0:
        return {}
    if len(args) == 1:
        return args[0]
    return list(args)


def _format_issues(issues: list[Any]) -> str:
    formatted: list[str] = []
    for issue in issues:
        path = ".".join(str(part) for part in getattr(issue, "path", [])) or "<root>"
        message = getattr(issue, "message", str(issue))
        formatted.append(f"{path}: {message}")
    return "; ".join(formatted)


def validate_schema_value(schema: Schema | None, value: Any, context: str) -> Any:
    if schema is None:
        return value
    result = schema.safe_parse(value)
    if result.success:
        return result.data
    raise BSBValidationError(f"{context}: {_format_issues(result.issues)}")


def validate_plugin_config(config_cls: Any, value: Any, context: str) -> Any:
    schema = getattr(config_cls, "validation_schema", None)
    if schema is None:
        return {} if value is None else value
    payload = {} if value is None else value
    return validate_schema_value(schema, payload, context)


@dataclass(slots=True)
class PluginCtor:
    app_id: str
    mode: str
    plugin_name: str
    cwd: str
    package_cwd: str
    plugin_cwd: str
    config: Any
    plugin_version: str
    observable_backend: ObservableBackend
    events: Any = None


class BSBPluginBase:
    metadata: dict[str, Any] = {}

    def __init__(self, ctor: PluginCtor) -> None:
        self.app_id = ctor.app_id
        self.mode = ctor.mode
        self.plugin_name = ctor.plugin_name
        self.cwd = ctor.cwd
        self.package_cwd = ctor.package_cwd
        self.plugin_cwd = ctor.plugin_cwd
        self.config = ctor.config
        self.plugin_version = ctor.plugin_version
        self._obs = ctor.observable_backend

    async def init(self, trace: Trace) -> None:
        return None

    async def run(self, trace: Trace) -> None:
        return None

    def dispose(self) -> None:
        return None


class BSBConfig(BSBPluginBase):
    async def get_plugin_config(self, trace: Trace, plugin_type: str, plugin_name: str) -> dict[str, Any] | None:
        raise NotImplementedError

    async def get_service_plugins(self, trace: Trace) -> dict[str, Any]:
        raise NotImplementedError

    async def get_events_plugins(self, trace: Trace) -> dict[str, Any]:
        raise NotImplementedError

    async def get_observable_plugins(self, trace: Trace) -> dict[str, Any]:
        raise NotImplementedError

    async def get_service_plugin_definition(self, trace: Trace, plugin_name: str) -> dict[str, Any]:
        raise NotImplementedError


class BSBEvents(BSBPluginBase):
    async def on_broadcast(self, trace: Trace, plugin_name: str, event: str, listener: Callable[..., Awaitable[None]]) -> None:
        raise NotImplementedError

    async def emit_broadcast(self, trace: Trace, plugin_name: str, event: str, payload: Any) -> None:
        raise NotImplementedError

    async def on_event(self, trace: Trace, plugin_name: str, event: str, listener: Callable[..., Awaitable[None]]) -> None:
        raise NotImplementedError

    async def emit_event(self, trace: Trace, plugin_name: str, event: str, payload: Any) -> None:
        raise NotImplementedError

    async def on_returnable_event(self, trace: Trace, plugin_name: str, event: str, listener: Callable[..., Awaitable[Any]]) -> None:
        raise NotImplementedError

    async def emit_event_and_return(
        self,
        trace: Trace,
        plugin_name: str,
        event: str,
        timeout_seconds: float,
        payload: Any,
    ) -> Any:
        raise NotImplementedError


class _PluginEventsFacadeBase:
    def __init__(self, target_plugin_name: str, events_controller: Any, observable: ObservableBackend) -> None:
        self._target_plugin_name = target_plugin_name
        self._events = events_controller
        self._obs = observable

    async def on_event(self, event: str, listener: Callable[..., Awaitable[None]]) -> None:
        await self._events.on_event(self._target_plugin_name, event, listener)

    async def emit_event(self, event: str, *args: Any) -> None:
        await self._events.emit_event(self._target_plugin_name, event, _normalize_payload(args))

    async def on_broadcast(self, event: str, listener: Callable[..., Awaitable[None]]) -> None:
        await self._events.on_broadcast(self._target_plugin_name, event, listener)

    async def emit_broadcast(self, event: str, *args: Any) -> None:
        await self._events.emit_broadcast(self._target_plugin_name, event, _normalize_payload(args))

    async def on_returnable_event(self, event: str, listener: Callable[..., Awaitable[Any]]) -> None:
        await self._events.on_returnable_event(self._target_plugin_name, event, listener)

    async def emit_event_and_return(self, event: str, *args: Any, timeout_seconds: float = 30.0) -> Any:
        return await self._events.emit_event_and_return(
            self._target_plugin_name,
            event,
            timeout_seconds,
            _normalize_payload(args),
        )


class PluginEventsFacade(_PluginEventsFacadeBase):
    pass


class ServiceClient:
    def __init__(self, target_plugin_name: str, context: "BSBService") -> None:
        self.target_plugin_name = target_plugin_name
        self.context = context
        self.events = _PluginEventsFacadeBase(target_plugin_name, context._events_controller, context._obs)


class BSBService(BSBPluginBase):
    EventSchemas: dict[str, Any] = {}
    init_before_plugins: list[str] = []
    init_after_plugins: list[str] = []
    run_before_plugins: list[str] = []
    run_after_plugins: list[str] = []

    def __init__(self, ctor: PluginCtor) -> None:
        super().__init__(ctor)
        self._events_controller = ctor.events
        self.events = PluginEventsFacade(self.plugin_name, ctor.events, self._obs)
        self._clients: list[Any] = []

    def use_client(self, client_cls: type[Any], *args: Any, **kwargs: Any) -> Any:
        client = client_cls(self, *args, **kwargs)
        self._clients.append(client)
        return client
