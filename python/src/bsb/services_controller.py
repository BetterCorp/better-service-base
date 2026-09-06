from __future__ import annotations

from dataclasses import dataclass, field
from graphlib import TopologicalSorter
from typing import Any

from .base import BSBService, PluginCtor, dispose_all, validate_plugin_config
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

    async def dispose(self) -> None:
        await dispose_all(reversed(self._active_services))

    async def setup(self, sb_config: Any) -> None:
        plugins = await sb_config.get_service_plugins()
        if not plugins:
            raise RuntimeError("At least one enabled service is required")
        self._definitions = await sb_config.get_service_references()
        self.sb_events.set_services(self._definitions)
        for alias, plugin_def in plugins.items():
            await self._add_service(
                sb_config,
                alias,
                self._field(plugin_def, "plugin"),
                self._field(plugin_def, "package"),
                self._field(plugin_def, "version"),
                self._field(plugin_def, "language"),
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
            if plugin in self._definitions:
                out.append(plugin)
            else:
                out.extend(alias for alias, definition in self._definitions.items() if definition.get("plugin") == plugin)
        return out

    async def _add_service(self, sb_config: Any, alias: str, plugin_ref: str, package: str | None, version=None, language=None) -> None:
        loaded: LoadedPlugin = await self.sb_plugins.load_plugin("service", package, plugin_ref or alias, alias, version, language)
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
                observable_backend=self.obs.for_plugin(alias),
                events=self.sb_events,
            )
        )
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

    def _sort_by_deps(self, phase: str, plugins: list[_SortedService]) -> list[_SortedService]:
        by_name = {plugin.plugin_name: plugin for plugin in plugins}
        dependencies: dict[str, set[str]] = {name: set() for name in by_name}
        for plugin in plugins:
            before = plugin.init_before_plugins if phase == "init" else plugin.run_before_plugins
            after = plugin.init_after_plugins if phase == "init" else plugin.run_after_plugins
            dependencies[plugin.plugin_name].update(name for name in after if name in by_name)
            for name in before:
                if name in dependencies:
                    dependencies[name].add(plugin.plugin_name)
        return [by_name[name] for name in TopologicalSorter(dependencies).static_order()]

    async def _sort_and_run_or_init(self, phase: str) -> None:
        plugins = self._sort_by_deps(phase, self._gather_list())
        if phase == "init":
            self._active_services = [plugin.reference for plugin in plugins]
        for plugin in plugins:
            trace = plugin.reference.create_trace(phase)
            fn = getattr(plugin.reference, phase)
            try:
                await fn(trace)
            except Exception as error:
                trace.error(error)
                raise
            finally:
                trace.end()
