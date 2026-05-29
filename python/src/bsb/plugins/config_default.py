from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml

from ..base import BSBConfig, BSBError
from ..observable import Trace
from ..schema import object_schema


class Config:
    metadata = {
        "name": "config-default",
        "description": "Default file-backed configuration provider.",
        "category": "config",
    }
    validation_schema = object_schema({})


class Plugin(BSBConfig):
    def __init__(self, ctor) -> None:
        super().__init__(ctor)
        self._deployment_profile = os.environ.get("BSB_PROFILE", "default")
        self._config_file = os.environ.get("BSB_CONFIG_FILE", "./sec-config.yaml")
        self._app_config: dict[str, Any] = {}

    async def init(self, trace: Trace) -> None:
        self._deployment_profile = os.environ.get("BSB_PROFILE", self._deployment_profile)
        self._config_file = os.environ.get("BSB_CONFIG_FILE", self._config_file)
        cfg_path = Path(self.cwd) / self._config_file
        if not cfg_path.exists():
            raise BSBError(f"Cannot find config file at {cfg_path}")
        self._app_config = self._load_config(cfg_path)
        if self._deployment_profile not in self._app_config:
            raise BSBError(f"Unknown deployment profile {self._deployment_profile}")
        self._obs.info(trace, "Config ready, using profile: {profile}", {"profile": self._deployment_profile})

    def _load_config(self, cfg_path: Path) -> dict[str, Any]:
        text = cfg_path.read_text(encoding="utf-8")
        if cfg_path.suffix.lower() in {".yaml", ".yml"}:
            try:
                return yaml.safe_load(text) or {}
            except Exception as ex:  # pragma: no cover
                raise BSBError(f"YAML parsing failed for {cfg_path}: {ex}") from ex
        raise BSBError(
            f"Unsupported config format for {cfg_path}. "
            "Use YAML via .yaml or .yml for the default config plugin."
        )

    def _profile(self) -> dict[str, Any]:
        return self._app_config[self._deployment_profile]

    async def get_observable_plugins(self, trace: Trace | None = None) -> dict[str, Any]:
        plugins = self._profile().get("observable", {})
        return {k: v for k, v in plugins.items() if v.get("enabled", False)}

    async def get_events_plugins(self, trace: Trace | None = None) -> dict[str, Any]:
        plugins = self._profile().get("events", {})
        return {k: v for k, v in plugins.items() if v.get("enabled", False)}

    async def get_service_plugins(self, trace: Trace | None = None) -> dict[str, Any]:
        plugins = self._profile().get("services", {})
        return {k: v for k, v in plugins.items() if v.get("enabled", False)}

    async def get_plugin_config(self, trace: Trace | None, plugin_type: str, plugin_name: str) -> dict[str, Any] | None:
        if plugin_type == "config":
            return None
        group = "services"
        if plugin_type == "events":
            group = "events"
        if plugin_type == "observable":
            group = "observable"
        return self._profile().get(group, {}).get(plugin_name, {}).get("config")

    async def get_service_plugin_definition(self, trace: Trace | None, plugin_name: str) -> dict[str, Any]:
        plugins = self._profile().get("services", {})
        keyed = [{"mapped_name": key, **value} for key, value in plugins.items()]
        enabled = next((x for x in keyed if x.get("plugin") == plugin_name and x.get("enabled", False)), None)
        if enabled:
            return {"name": enabled["mapped_name"], "enabled": True}
        any_state = next((x for x in keyed if x.get("plugin") == plugin_name), None)
        if any_state:
            return {"name": any_state["mapped_name"], "enabled": bool(any_state.get("enabled", False))}
        raise BSBError(f"Cannot find plugin {plugin_name} in config")

    def dispose(self) -> None:
        self._app_config = {}
