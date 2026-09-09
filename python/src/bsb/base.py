from __future__ import annotations

from dataclasses import dataclass
import inspect
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
    schema = getattr(config_cls, "validation_schema", None) or getattr(config_cls, "ConfigSchema", None)
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


async def dispose_all(instances) -> None:
    errors = []
    seen = set()
    for instance in instances:
        if id(instance) in seen:
            continue
        seen.add(id(instance))
        try:
            result = instance.dispose()
            if inspect.isawaitable(result):
                await result
        except Exception as error:
            errors.append(error)
    if errors:
        raise ExceptionGroup("Plugin cleanup failed", errors)


class BSBObservable(BSBPluginBase):
    def emit_log(self, entry: dict) -> None:
        pass

    def emit_span(self, entry: dict) -> None:
        pass

    def emit_metric(self, entry: dict) -> None:
        pass


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
    async def receive_stream(self, trace: Trace, plugin_name: str, event: str, handler, timeout_seconds: float = 5) -> str:
        raise NotImplementedError

    async def send_stream(self, trace: Trace, plugin_name: str, event: str, stream_id: str, source) -> None:
        raise NotImplementedError

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
    def __init__(self, target_plugin_name: str, events_controller: Any, observable: ObservableBackend, schemas: dict | None = None) -> None:
        self._target_plugin_name = target_plugin_name
        self._events = events_controller
        self._obs = observable
        self._schemas = schemas

    def _schema(self, category: str, event: str) -> dict:
        if self._schemas is None:
            return {}
        if event not in self._schemas.get(category, {}):
            raise BSBValidationError(f"Undeclared {category} event {self._target_plugin_name}.{event}")
        return self._schemas[category][event]

    @staticmethod
    def _specific(event: str, server_id: str | None) -> str:
        if server_id is None:
            return event
        if not isinstance(server_id, str) or not server_id.strip() or "\0" in server_id:
            raise ValueError("Invalid server ID")
        return f"{event}-{server_id}"

    async def _listen(self, category, method, event, listener, obs, server_id=None):
        schema = self._schema(category, event)
        async def validated(trace, payload):
            parsed = validate_schema_value(schema.get("input"), payload, event + " input")
            result = await listener(trace, parsed)
            return validate_schema_value(schema.get("output"), result, event + " output")
        await getattr(self._events, method)(self._target_plugin_name, self._specific(event, server_id), validated, obs=obs)

    async def on_event(self, event: str, listener: Callable[..., Awaitable[None]], *, obs: Trace | None = None, server_id: str | None = None) -> None:
        await self._listen("onEvents", "on_event", event, listener, obs, server_id)

    async def emit_event(self, event: str, *args: Any, obs: Trace | None = None, server_id: str | None = None) -> None:
        payload = validate_schema_value(self._schema("emitEvents", event).get("input"), _normalize_payload(args), event + " input")
        await self._events.emit_event(self._target_plugin_name, self._specific(event, server_id), payload, obs=obs)

    async def on_broadcast(self, event: str, listener: Callable[..., Awaitable[None]], *, obs: Trace | None = None) -> None:
        await self._listen("onBroadcast", "on_broadcast", event, listener, obs)

    async def emit_broadcast(self, event: str, *args: Any, obs: Trace | None = None) -> None:
        payload = validate_schema_value(self._schema("emitBroadcast", event).get("input"), _normalize_payload(args), event + " input")
        await self._events.emit_broadcast(self._target_plugin_name, event, payload, obs=obs)

    async def on_returnable_event(self, event: str, listener: Callable[..., Awaitable[Any]], *, obs: Trace | None = None, server_id: str | None = None) -> None:
        await self._listen("onReturnableEvents", "on_returnable_event", event, listener, obs, server_id)

    async def emit_event_and_return(self, event: str, *args: Any, timeout_seconds: float = 30.0, obs: Trace | None = None, server_id: str | None = None) -> Any:
        schema = self._schema("emitReturnableEvents", event)
        payload = validate_schema_value(schema.get("input"), _normalize_payload(args), event + " input")
        result = await self._events.emit_event_and_return(self._target_plugin_name, self._specific(event, server_id), timeout_seconds, payload, obs=obs)
        return validate_schema_value(schema.get("output"), result, event + " output")

    async def receive_stream(self, event: str, handler: Callable, *, obs: Trace | None = None, timeout_seconds: float = 5) -> str:
        return await self._events.receive_stream(self._target_plugin_name, event, handler, obs=obs, timeout_seconds=timeout_seconds)

    async def send_stream(self, event: str, stream_id: str, source: Any, *, obs: Trace | None = None) -> None:
        await self._events.send_stream(self._target_plugin_name, event, stream_id, source, obs=obs)


class PluginEventsFacade(_PluginEventsFacadeBase):
    pass


class ServiceClient:
    def __init__(self, target_plugin_name: str, context: "BSBService", schema: dict | None = None) -> None:
        from .schema_events import import_event_schemas
        self.target_plugin_name = target_plugin_name
        self.context = context
        self.events = _PluginEventsFacadeBase(target_plugin_name, context._events_controller, context._obs,
            import_event_schemas(schema, client=True) if schema is not None else None)


class BSBService(BSBPluginBase):
    EventSchemas: dict[str, Any] = {}
    init_before_plugins: list[str] = []
    init_after_plugins: list[str] = []
    run_before_plugins: list[str] = []
    run_after_plugins: list[str] = []

    def __init__(self, ctor: PluginCtor) -> None:
        super().__init__(ctor)
        self._events_controller = ctor.events
        self.events = PluginEventsFacade(self.plugin_name, ctor.events, self._obs, self.EventSchemas)
        self._clients: list[Any] = []

    def create_trace(self, name: str, attributes: dict | None = None) -> Trace:
        return self._obs.create_trace(name, attributes=attributes)

    def create_self(self) -> ServiceClient:
        from .schema_events import export_event_schemas
        return ServiceClient(self.plugin_name, self, export_event_schemas(self.plugin_name, self.plugin_version, self.EventSchemas))

    def use_client(self, client_cls: type[Any], *args: Any, **kwargs: Any) -> Any:
        client = client_cls(self, *args, **kwargs)
        self._clients.append(client)
        return client
