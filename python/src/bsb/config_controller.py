from __future__ import annotations

import json
import os

from .base import PluginCtor, dispose_all, validate_plugin_config


class SBConfig:
    def __init__(self, app_id, mode, cwd, sb_plugins, observable_backend) -> None:
        self.app_id, self.mode, self.cwd, self.sb_plugins, self.obs = app_id, mode, cwd, sb_plugins, observable_backend
        self.config_plugin = None

    async def init(self) -> None:
        name = os.environ.get("BSB_CONFIG_PLUGIN", "config-default")
        loaded = await self.sb_plugins.load_plugin("config", os.environ.get("BSB_CONFIG_PLUGIN_PACKAGE"), name, name)
        values = {}
        schema = getattr(loaded.service_config, "validation_schema", None) or getattr(loaded.service_config, "ConfigSchema", None)
        if schema is not None:
            root = schema.export("extended")["root"]
            while root["kind"] in ("optional", "nullable"):
                root = root.get("schema", root.get("inner"))
            for key, field in root.get("properties", {}).items():
                if key not in os.environ:
                    continue
                while field["kind"] in ("optional", "nullable"):
                    field = field.get("schema", field.get("inner"))
                raw = os.environ[key]
                values[key] = raw if field["kind"] == "string" else json.loads(raw)
        backend = self.obs.for_plugin(name)
        self.config_plugin = loaded.plugin(PluginCtor(self.app_id, self.mode, name, self.cwd, loaded.package_cwd, loaded.plugin_cwd,
            validate_plugin_config(loaded.service_config, values, "Invalid configuration provider settings"), loaded.version, backend))
        trace = backend.create_trace("init")
        try:
            await self.config_plugin.init(trace)
        finally:
            trace.end()

    async def dispose(self) -> None:
        if self.config_plugin is not None:
            await dispose_all([self.config_plugin])

    async def _read(self, method, *args):
        trace = self.obs.create_trace("config." + method)
        try:
            return await getattr(self.config_plugin, method)(trace, *args)
        finally:
            trace.end()

    async def get_plugin_config(self, plugin_type, name):
        return await self._read("get_plugin_config", plugin_type, name)

    async def get_service_plugins(self):
        return await self._read("get_service_plugins")

    async def get_service_references(self):
        return await self._read("get_service_references" if hasattr(self.config_plugin, "get_service_references") else "get_service_plugins")

    async def get_events_plugins(self):
        return await self._read("get_events_plugins")

    async def get_observable_plugins(self):
        return await self._read("get_observable_plugins")

    async def get_service_plugin_definition(self, name):
        return await self._read("get_service_plugin_definition", name)
