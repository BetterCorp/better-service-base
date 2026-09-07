from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass
from typing import Any

from .base import BSBEvents, PluginCtor, dispose_all, validate_plugin_config
from .observable import ObservableBackend, Trace


@dataclass(slots=True)
class _EventsRef:
    name: str
    plugin: BSBEvents
    on: Any = None


class SBEvents:
    def __init__(self, app_id, mode, cwd, sb_plugins, observable_backend: ObservableBackend) -> None:
        self.app_id, self.mode, self.cwd, self.sb_plugins, self.obs = app_id, mode, cwd, sb_plugins, observable_backend
        self.events: list[_EventsRef] = []
        self.services: dict[str, dict] = {}

    async def init(self, sb_config) -> None:
        definitions = await sb_config.get_events_plugins()
        if not any(value.get("filter") is None for value in definitions.values()):
            definitions = {**definitions, "_local_fallback": {"plugin": "events-default"}}
        for alias, definition in definitions.items():
            loaded = await self.sb_plugins.load_plugin("events", definition.get("package"), definition.get("plugin", alias), alias, definition.get("version"), definition.get("language"))
            backend = self.obs.for_plugin(alias)
            plugin = loaded.plugin(PluginCtor(self.app_id, self.mode, alias, self.cwd, loaded.package_cwd, loaded.plugin_cwd,
                validate_plugin_config(loaded.service_config, definition.get("config"), f"Invalid events config {alias}"), loaded.version, backend))
            self.events.append(_EventsRef(alias, plugin, definition.get("filter")))
            trace = backend.create_trace("init")
            try:
                await plugin.init(trace)
            finally:
                trace.end()

    async def run(self) -> None:
        for ref in self.events:
            trace = ref.plugin._obs.create_trace("run")
            try:
                await ref.plugin.run(trace)
            finally:
                trace.end()

    async def dispose(self) -> None:
        await dispose_all(ref.plugin for ref in reversed(self.events))

    async def wait_for_failure(self) -> None:
        pending = [ref.plugin.failure for ref in self.events if getattr(ref.plugin, "failure", None) is not None]
        if not pending:
            await asyncio.Future()
        done, _ = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
        await next(iter(done))

    def set_services(self, services: dict[str, dict]) -> None:
        self.services = services

    def _target(self, plugin: str) -> str:
        if plugin in self.services:
            return plugin
        matches = [(key, value) for key, value in self.services.items() if value.get("plugin") == plugin]
        active = [key for key, value in matches if value.get("enabled", True)]
        targets = active or [key for key, _ in matches]
        if len(targets) > 1:
            raise ValueError(f"Ambiguous service {plugin}; specify its alias")
        return targets[0] if targets else plugin

    @staticmethod
    def matches(filter_value, operation: str, plugin: str) -> bool:
        if filter_value is None:
            return True
        if isinstance(filter_value, list):
            return operation in filter_value
        if not isinstance(filter_value, dict):
            raise ValueError("Invalid events filter")
        value = filter_value.get(operation, False)
        if type(value) is bool:
            return value
        if isinstance(value, dict):
            if value.get("enabled") is not True:
                return False
            value = value.get("plugins")
        if not isinstance(value, list):
            raise ValueError("Invalid events filter plugin list")
        return plugin in value

    def _select_plugin(self, operation: str, plugin: str) -> BSBEvents:
        return next((ref.plugin for ref in self.events if self.matches(ref.on, operation, plugin)), None) or self._missing(operation, plugin)

    @staticmethod
    def _missing(operation, plugin):
        raise RuntimeError(f"No events backend matches {operation} for {plugin}")

    async def _call(self, method: str, plugin: str, event: str, *args, obs: Trace | None = None):
        operation = method.split("_")[0] + "".join(part.title() for part in method.split("_")[1:])
        target = self._target(plugin)
        backend = self._select_plugin(operation, target)
        trace = self.obs.for_plugin(target).create_trace("events." + method, parent=obs)
        try:
            return await getattr(backend, method)(trace, target, event, *args)
        except Exception as error:
            trace.error(error)
            raise
        finally:
            trace.end()

    async def on_event(self, plugin, event, listener, *, obs=None):
        await self._call("on_event", plugin, event, listener, obs=obs)

    async def emit_event(self, plugin, event, payload, *, obs=None):
        await self._call("emit_event", plugin, event, payload, obs=obs)

    async def on_returnable_event(self, plugin, event, listener, *, obs=None):
        await self._call("on_returnable_event", plugin, event, listener, obs=obs)

    async def emit_event_and_return(self, plugin, event, timeout_seconds, payload, *, obs=None):
        if type(timeout_seconds) not in (int, float) or not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
            raise ValueError("RPC timeout must be positive and finite")
        return await self._call("emit_event_and_return", plugin, event, timeout_seconds, payload, obs=obs)

    async def on_broadcast(self, plugin, event, listener, *, obs=None):
        await self._call("on_broadcast", plugin, event, listener, obs=obs)

    async def emit_broadcast(self, plugin, event, payload, *, obs=None):
        await self._call("emit_broadcast", plugin, event, payload, obs=obs)

    async def receive_stream(self, plugin, event, handler, *, obs=None, timeout_seconds=5):
        return await self._call("receive_stream", plugin, event, handler, timeout_seconds, obs=obs)

    async def send_stream(self, plugin, event, stream_id, source, *, obs=None):
        await self._call("send_stream", plugin, event, stream_id, source, obs=obs)
