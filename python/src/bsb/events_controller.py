from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from .base import BSBEvents, PluginCtor, validate_plugin_config, validate_schema_value
from .observable import ObservableBackend
from .plugin_loader import LoadedPlugin, SBPlugins
from .plugins.events_default import Plugin as DefaultEventsPlugin
from .schema_events import BSBEventSchemas, EventCategory, get_event_definition


Listener = Callable[..., Awaitable[Any]]


@dataclass(slots=True)
class _EventsRef:
    name: str
    plugin: BSBEvents
    on: Any = None
    on_typeof: str = "all"


class SBEvents:
    def __init__(
        self,
        app_id: str,
        mode: str,
        cwd: str,
        sb_plugins: SBPlugins,
        observable_backend: ObservableBackend,
    ) -> None:
        self.app_id = app_id
        self.mode = mode
        self.cwd = cwd
        self.sb_plugins = sb_plugins
        self.obs = observable_backend
        self.events: list[_EventsRef] = []
        self.service_schemas: dict[str, BSBEventSchemas] = {}

    async def init(self, sb_config: Any) -> None:
        plugins = await sb_config.get_events_plugins()
        for alias, plugin_def in plugins.items():
            await self._add_events_plugin(
                alias,
                self._field(plugin_def, "plugin"),
                self._field(plugin_def, "package"),
                self._field(plugin_def, "config"),
                self._field(plugin_def, "filter"),
            )

        self.events.append(
            _EventsRef(
                name="events-default",
                plugin=DefaultEventsPlugin(
                    PluginCtor(
                        app_id=self.app_id,
                        mode=self.mode,
                        plugin_name="events-default",
                        cwd=self.cwd,
                        package_cwd=self.cwd,
                        plugin_cwd=self.cwd,
                        config=None,
                        plugin_version="1.0.0",
                        observable_backend=self.obs,
                    )
                ),
            )
        )

    async def run(self) -> None:
        if len(self.events) <= 1:
            return
        has_all = any(ref.name != "events-default" and ref.on_typeof == "all" for ref in self.events)
        if has_all:
            self.events = [x for x in self.events if x.name != "events-default"]

    def dispose(self) -> None:
        for ref in self.events:
            ref.plugin.dispose()

    def register_service_schemas(self, plugin_name: str, schemas: BSBEventSchemas | None) -> None:
        self.service_schemas[plugin_name] = schemas or {}

    async def _add_events_plugin(
        self,
        alias: str,
        plugin_ref: str,
        package: str | None,
        config: dict[str, Any] | None,
        filter_obj: Any,
    ) -> None:
        loaded: LoadedPlugin = await self.sb_plugins.load_plugin("events", package, plugin_ref, alias)
        plugin = loaded.plugin(
            PluginCtor(
                app_id=self.app_id,
                mode=self.mode,
                plugin_name=loaded.name,
                cwd=self.cwd,
                package_cwd=loaded.package_cwd,
                plugin_cwd=loaded.plugin_cwd,
                config=validate_plugin_config(loaded.service_config, config, f"Invalid config for events plugin {alias}"),
                plugin_version=loaded.version,
                observable_backend=self.obs,
            )
        )
        on_typeof = "all"
        if isinstance(filter_obj, list):
            on_typeof = "events"
        elif isinstance(filter_obj, dict):
            on_typeof = "eventsState"
        self.events.append(_EventsRef(name=alias, plugin=plugin, on=filter_obj, on_typeof=on_typeof))

    @staticmethod
    def _field(defn: Any, key: str) -> Any:
        if isinstance(defn, dict):
            return defn.get(key)
        return getattr(defn, key, None)

    def _matches(self, ref: _EventsRef, event_type: str, plugin_name: str) -> bool:
        if ref.on is None:
            return True
        if ref.on_typeof == "events" and isinstance(ref.on, list):
            return event_type in ref.on
        if ref.on_typeof == "eventsState" and isinstance(ref.on, dict):
            return bool(ref.on.get(event_type))
        if ref.on_typeof == "eventsPlugins" and isinstance(ref.on, dict):
            value = ref.on.get(event_type)
            return isinstance(value, list) and plugin_name in value
        return True

    def _select_plugin(self, event_type: str, plugin_name: str) -> BSBEvents:
        for ref in self.events:
            if self._matches(ref, event_type, plugin_name):
                return ref.plugin
        raise RuntimeError(f"No events plugin available for {event_type}:{plugin_name}")

    def _validate_event_input(self, plugin_name: str, category: EventCategory, event: str, payload: Any) -> Any:
        event_def = get_event_definition(self.service_schemas.get(plugin_name), category, event)
        schema = event_def["input"] if event_def else None
        return validate_schema_value(schema, payload, f"{plugin_name}.{event} input")

    def _validate_event_output(self, plugin_name: str, category: EventCategory, event: str, payload: Any) -> Any:
        event_def = get_event_definition(self.service_schemas.get(plugin_name), category, event)
        schema = event_def["output"] if event_def and "output" in event_def else None
        return validate_schema_value(schema, payload, f"{plugin_name}.{event} output")

    async def emit_broadcast(self, plugin_name: str, event: str, payload: Any) -> None:
        trace = self.obs.create_trace("events:emit_broadcast", "SBEvents")
        parsed = self._validate_event_input(plugin_name, "onBroadcast", event, payload)
        await self._select_plugin("broadcast", plugin_name).emit_broadcast(trace, plugin_name, event, parsed)

    async def on_event(self, plugin_name: str, event: str, listener: Listener) -> None:
        trace = self.obs.create_trace("events:on_event", "SBEvents")

        async def validated_listener(listener_trace: Any, payload: Any) -> Any:
            parsed = self._validate_event_input(plugin_name, "onEvents", event, payload)
            return await listener(listener_trace, parsed)

        await self._select_plugin("emit", plugin_name).on_event(trace, plugin_name, event, validated_listener)

    async def emit_event(self, plugin_name: str, event: str, payload: Any) -> None:
        trace = self.obs.create_trace("events:emit_event", "SBEvents")
        parsed = self._validate_event_input(plugin_name, "onEvents", event, payload)
        await self._select_plugin("emit", plugin_name).emit_event(trace, plugin_name, event, parsed)

    async def on_returnable_event(self, plugin_name: str, event: str, listener: Listener) -> None:
        trace = self.obs.create_trace("events:on_returnable_event", "SBEvents")

        async def validated_listener(listener_trace: Any, payload: Any) -> Any:
            parsed = self._validate_event_input(plugin_name, "onReturnableEvents", event, payload)
            result = await listener(listener_trace, parsed)
            return self._validate_event_output(plugin_name, "onReturnableEvents", event, result)

        await self._select_plugin("emitAndReturn", plugin_name).on_returnable_event(
            trace,
            plugin_name,
            event,
            validated_listener,
        )

    async def emit_event_and_return(self, plugin_name: str, event: str, timeout_seconds: float, payload: Any) -> Any:
        trace = self.obs.create_trace("events:emit_event_and_return", "SBEvents")
        parsed = self._validate_event_input(plugin_name, "onReturnableEvents", event, payload)
        result = await self._select_plugin("emitAndReturn", plugin_name).emit_event_and_return(
            trace,
            plugin_name,
            event,
            timeout_seconds,
            parsed,
        )
        return self._validate_event_output(plugin_name, "onReturnableEvents", event, result)

    async def on_broadcast(self, plugin_name: str, event: str, listener: Listener) -> None:
        trace = self.obs.create_trace("events:on_broadcast", "SBEvents")

        async def validated_listener(listener_trace: Any, payload: Any) -> Any:
            parsed = self._validate_event_input(plugin_name, "onBroadcast", event, payload)
            return await listener(listener_trace, parsed)

        await self._select_plugin("broadcast", plugin_name).on_broadcast(trace, plugin_name, event, validated_listener)
