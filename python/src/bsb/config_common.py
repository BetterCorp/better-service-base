from __future__ import annotations

from copy import deepcopy
from typing import Any

from .base import BSBConfig, BSBError


def merge(base: dict, override: dict) -> dict:
    result = deepcopy(base)
    for key, value in override.items():
        result[key] = merge(result[key], value) if isinstance(result.get(key), dict) and isinstance(value, dict) else deepcopy(value)
    return result


def resolve_service_target(services: dict[str, dict], target: str) -> str:
    exact = services.get(target)
    if exact is not None and exact.get("plugin") != target:
        return target
    matches = [(key, value) for key, value in services.items() if value.get("plugin") == target]
    active = [key for key, value in matches if value.get("enabled", True)]
    targets = active or [key for key, _ in matches]
    if len(targets) > 1:
        raise ValueError(f"Ambiguous service {target}; specify its alias")
    return targets[0] if targets else target


class JsonConfig(BSBConfig):
    def load(self, document: dict[str, Any], profile: str = "default") -> None:
        if not isinstance(document, dict):
            raise BSBError("Configuration must be an object")
        if any(key in document for key in ("services", "events", "observable")):
            selected = {key: value for key, value in document.items() if key != "profiles"}
            if profile != "default":
                if profile not in document.get("profiles", {}):
                    raise BSBError(f"Unknown deployment profile {profile}")
                selected = merge(selected, document["profiles"][profile])
        else:
            if profile not in document:
                raise BSBError(f"Unknown deployment profile {profile}")
            selected = merge(document.get("default", {}), document[profile])
        if selected.get("language", "python") != "python":
            raise BSBError("Deployment profile does not target Python")
        for group in ("services", "events", "observable"):
            section = selected.setdefault(group, {})
            if not isinstance(section, dict):
                raise BSBError(f"{group} must be an object")
            for alias, definition in section.items():
                if not isinstance(alias, str) or not alias or not isinstance(definition, dict):
                    raise BSBError("Invalid plugin definition")
                definition.setdefault("plugin", alias)
                definition.setdefault("enabled", True)
                if type(definition["enabled"]) is not bool:
                    raise BSBError(f"{alias}.enabled must be boolean")
                if definition["enabled"] and definition.get("language", "python") != "python":
                    raise BSBError(f"Enabled plugin {alias} does not target Python")
                if definition.get("config") is not None and not isinstance(definition["config"], dict):
                    raise BSBError(f"{alias}.config must be an object")
        self._profile_data = selected

    def _enabled(self, group: str) -> dict:
        return {key: deepcopy(value) for key, value in self._profile_data[group].items() if value["enabled"]}

    async def get_service_plugins(self, trace=None) -> dict:
        return self._enabled("services")

    async def get_service_references(self, trace=None) -> dict:
        return deepcopy(self._profile_data["services"])

    async def get_events_plugins(self, trace=None) -> dict:
        return self._enabled("events")

    async def get_observable_plugins(self, trace=None) -> dict:
        return self._enabled("observable")

    async def get_plugin_config(self, trace, plugin_type: str, plugin_name: str) -> dict | None:
        group = "services" if plugin_type == "service" else plugin_type
        return deepcopy(self._profile_data.get(group, {}).get(plugin_name, {}).get("config"))

    async def get_service_plugin_definition(self, trace, plugin_name: str) -> dict:
        plugins = self._profile_data["services"]
        try:
            name = resolve_service_target(plugins, plugin_name)
            value = plugins[name]
        except (KeyError, ValueError) as error:
            raise BSBError(f"Service reference {plugin_name} is missing or ambiguous; use its profile alias") from error
        return {**deepcopy(value), "name": name}
