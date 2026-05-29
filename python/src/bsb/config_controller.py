from __future__ import annotations

import os
from typing import Any

from .base import BSBConfig, PluginCtor
from .observable import ObservableBackend
from .plugin_loader import SBPlugins
from .plugins.config_default import Plugin as DefaultConfigPlugin


class SBConfig:
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
        self.config_package: str | None = None
        self.config_plugin_name = "config-default"
        self.config_plugin: BSBConfig = self._build_default()

    def _build_default(self) -> BSBConfig:
        return DefaultConfigPlugin(
            PluginCtor(
                app_id=self.app_id,
                mode=self.mode,
                plugin_name="config-default",
                cwd=self.cwd,
                package_cwd=self.cwd,
                plugin_cwd=self.cwd,
                config=None,
                plugin_version="1.0.0",
                observable_backend=self.obs,
            )
        )

    async def init(self) -> None:
        env_name = os.environ.get("BSB_CONFIG_PLUGIN")
        env_package = os.environ.get("BSB_CONFIG_PLUGIN_PACKAGE")
        if env_name and env_name.startswith("config-"):
            self.config_plugin_name = env_name
            self.config_package = env_package

        trace = self.obs.create_trace("config:init", "SBConfig")
        if self.config_plugin_name != "config-default":
            loaded = await self.sb_plugins.load_plugin("config", self.config_package, self.config_plugin_name, self.config_plugin_name)
            self.config_plugin = loaded.plugin(
                PluginCtor(
                    app_id=self.app_id,
                    mode=self.mode,
                    plugin_name=loaded.name,
                    cwd=self.cwd,
                    package_cwd=loaded.package_cwd,
                    plugin_cwd=loaded.plugin_cwd,
                    config=None,
                    plugin_version=loaded.version,
                    observable_backend=self.obs,
                )
            )
        await self.config_plugin.init(trace)

    def dispose(self) -> None:
        self.config_plugin.dispose()

    async def get_plugin_config(self, plugin_type: str, name: str) -> dict[str, Any] | None:
        return await self.config_plugin.get_plugin_config(self.obs.create_trace("config:get_plugin_config"), plugin_type, name)

    async def get_service_plugins(self) -> dict[str, Any]:
        return await self.config_plugin.get_service_plugins(self.obs.create_trace("config:get_service_plugins"))

    async def get_events_plugins(self) -> dict[str, Any]:
        return await self.config_plugin.get_events_plugins(self.obs.create_trace("config:get_events_plugins"))

    async def get_observable_plugins(self) -> dict[str, Any]:
        return await self.config_plugin.get_observable_plugins(self.obs.create_trace("config:get_observable_plugins"))

    async def get_service_plugin_definition(self, plugin_name: str) -> dict[str, Any]:
        return await self.config_plugin.get_service_plugin_definition(self.obs.create_trace("config:get_service_plugin_definition"), plugin_name)
