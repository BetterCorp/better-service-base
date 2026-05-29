from __future__ import annotations

from dataclasses import dataclass, field
from functools import cmp_to_key
from typing import Any

from .base import BSBService, PluginCtor, validate_plugin_config
from .events_controller import SBEvents
from .observable import ObservableBackend
from .plugin_loader import LoadedPlugin, SBPlugins


@dataclass(slots=True)
class _SortedService:
    src_plugin_name: str
    plugin_name: str
    init_before_plugins: list[str]
    init_after_plugins: list[str]
    run_before_plugins: list[str]
    run_after_plugins: list[str]
    reference: BSBService
    clients: list[Any] = field(default_factory=list)


class SBServices:
    def __init__(
        self,
        app_id: str,
        mode: str,
        cwd: str,
        sb_plugins: SBPlugins,
        sb_events: SBEvents,
        observable_backend: ObservableBackend,
    ) -> None:
        self.app_id = app_id
        self.mode = mode
        self.cwd = cwd
        self.sb_plugins = sb_plugins
        self.sb_events = sb_events
        self.obs = observable_backend
        self._active_services: list[BSBService] = []

    def dispose(self) -> None:
        for service in self._active_services:
            service.dispose()

    async def setup(self, sb_config: Any) -> None:
        plugins = await sb_config.get_service_plugins()
        for alias, plugin_def in plugins.items():
            await self._add_service(
                sb_config,
                alias,
                self._field(plugin_def, "plugin"),
                self._field(plugin_def, "package"),
            )
        for service in self._active_services:
            await self._remap_deps(sb_config, service)

    async def _remap_deps(self, sb_config: Any, service: BSBService) -> None:
        service.init_before_plugins = await self._map_plugins(sb_config, service.plugin_name, service.init_before_plugins)
        service.init_after_plugins = await self._map_plugins(sb_config, service.plugin_name, service.init_after_plugins)
        service.run_before_plugins = await self._map_plugins(sb_config, service.plugin_name, service.run_before_plugins)
        service.run_after_plugins = await self._map_plugins(sb_config, service.plugin_name, service.run_after_plugins)

    async def _map_plugins(self, sb_config: Any, ref_name: str, source: list[str]) -> list[str]:
        out: list[str] = []
        for plugin in source or []:
            plugin_def = await sb_config.get_service_plugin_definition(plugin)
            if not plugin_def.get("enabled", False):
                self.obs.warn(
                    self.obs.create_trace("services:map_plugins", "SBServices"),
                    "Plugin {plugin} is disabled for {pluginNeeded}",
                    {"plugin": plugin, "pluginNeeded": ref_name},
                )
            out.append(plugin_def["name"])
        return out

    async def _add_service(self, sb_config: Any, alias: str, plugin_ref: str, package: str | None) -> None:
        loaded: LoadedPlugin = await self.sb_plugins.load_plugin("service", package, plugin_ref, alias)
        plugin_config = validate_plugin_config(
            loaded.service_config,
            await sb_config.get_plugin_config("service", alias),
            f"Invalid config for service {alias}",
        )
        service = loaded.plugin(
            PluginCtor(
                app_id=self.app_id,
                mode=self.mode,
                plugin_name=loaded.name,
                cwd=self.cwd,
                package_cwd=loaded.package_cwd,
                plugin_cwd=loaded.plugin_cwd,
                config=plugin_config,
                plugin_version=loaded.version,
                observable_backend=self.obs,
                events=self.sb_events,
            )
        )
        self.sb_events.register_service_schemas(alias, getattr(loaded.plugin, "EventSchemas", {}))
        self._active_services.append(service)

    @staticmethod
    def _field(defn: Any, key: str) -> Any:
        if isinstance(defn, dict):
            return defn.get(key)
        return getattr(defn, key, None)

    async def init(self) -> None:
        await self._sort_and_run_or_init("init")

    async def run(self) -> None:
        await self._sort_and_run_or_init("run")

    def _gather_list(self) -> list[_SortedService]:
        out: list[_SortedService] = []
        for service in self._active_services:
            out.append(
                _SortedService(
                    src_plugin_name=service.plugin_name,
                    plugin_name=service.plugin_name,
                    init_before_plugins=list(service.init_before_plugins or []),
                    init_after_plugins=list(service.init_after_plugins or []),
                    run_before_plugins=list(service.run_before_plugins or []),
                    run_after_plugins=list(service.run_after_plugins or []),
                    reference=service,
                )
            )
        return out

    def _sort_by_deps(self, phase: str):
        def cmp(a: _SortedService, b: _SortedService) -> int:
            a_before = a.init_before_plugins if phase == "init" else a.run_before_plugins
            b_before = b.init_before_plugins if phase == "init" else b.run_before_plugins
            a_after = a.init_after_plugins if phase == "init" else a.run_after_plugins
            b_after = b.init_after_plugins if phase == "init" else b.run_after_plugins
            if b.plugin_name in a_before:
                return -1
            if a.plugin_name in b_before:
                return 1
            if b.plugin_name in a_after:
                return 1
            if a.plugin_name in b_after:
                return -1
            return 0

        return cmp_to_key(cmp)

    async def _sort_and_run_or_init(self, phase: str) -> None:
        trace = self.obs.create_trace(f"services:{phase}", "SBServices")
        plugins = sorted(self._gather_list(), key=self._sort_by_deps(phase))
        self.obs.info(trace, "{phase} plugins in order: {plugins}", {"phase": phase, "plugins": ",".join(x.plugin_name for x in plugins)})
        for plugin in plugins:
            fn = getattr(plugin.reference, phase)
            await fn(trace)
