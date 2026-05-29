from __future__ import annotations

import importlib
import json
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from types import ModuleType

from .schema_events import export_event_schemas


PluginType = str
VALID_CATEGORIES = {"service", "observable", "events", "config"}

OBSERVABLE_METHODS = {
    "logging": ["debug", "info", "warn", "error"],
    "metrics": ["create_counter", "create_gauge"],
    "tracing": ["create_trace"],
}
EVENTS_METHODS = [
    "on_broadcast",
    "emit_broadcast",
    "on_event",
    "emit_event",
    "on_returnable_event",
    "emit_event_and_return",
]
CONFIG_METHODS = [
    "get_observable_plugins",
    "get_events_plugins",
    "get_service_plugins",
    "get_service_plugin_definition",
    "get_plugin_config",
]


@dataclass(slots=True)
class DiscoveredPlugin:
    plugin_id: str
    plugin_type: PluginType
    plugin_cls: Any
    config_cls: Any
    module: ModuleType
    source_path: Path
    metadata: dict[str, Any]
    version: str


def read_project_metadata(project_root: str | Path) -> dict[str, Any]:
    pyproject_path = Path(project_root) / "pyproject.toml"
    if not pyproject_path.exists():
        return {}

    data = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
    project = data.get("project", {})
    urls = project.get("urls", {})
    authors = project.get("authors", [])
    author = authors[0] if authors else None
    author_value: str | dict[str, str] | None = None
    if isinstance(author, dict):
        if author.get("email"):
            author_value = {
                "name": author.get("name", ""),
                "email": author["email"],
            }
        elif author.get("name"):
            author_value = author["name"]

    return {
        "name": project.get("name"),
        "version": project.get("version"),
        "description": project.get("description", ""),
        "license": project.get("license"),
        "homepage": project.get("homepage") or urls.get("Homepage"),
        "repository": urls.get("Repository") or urls.get("Source"),
        "author": author_value,
        "runtime": {"python": project.get("requires-python")} if project.get("requires-python") else None,
    }


def _import_module(source_root: Path, file_path: Path) -> ModuleType:
    source_root_str = str(source_root)
    if source_root_str not in sys.path:
        sys.path.insert(0, source_root_str)
    module_name = ".".join(file_path.relative_to(source_root).with_suffix("").parts)
    existing = sys.modules.get(module_name)
    existing_path = Path(getattr(existing, "__file__", "")) if existing is not None else None
    if existing_path and existing_path.resolve() != file_path.resolve():
        del sys.modules[module_name]
    return importlib.import_module(module_name)


def _resolve_plugin_id(config_cls: Any, source_path: Path) -> str:
    metadata = getattr(config_cls, "metadata", None)
    if isinstance(metadata, dict) and isinstance(metadata.get("name"), str) and metadata["name"].strip():
        return metadata["name"].strip()
    return source_path.stem.replace("_", "-")


def infer_plugin_type(plugin_id: str, plugin_cls: Any) -> PluginType:
    lowered = plugin_id.lower()
    if lowered.startswith("service-"):
        return "service"
    if lowered.startswith("observable-"):
        return "observable"
    if lowered.startswith("events-"):
        return "events"
    if lowered.startswith("config-"):
        return "config"

    mro_names = {base.__name__ for base in getattr(plugin_cls, "__mro__", ())}
    if "BSBService" in mro_names:
        return "service"
    if "BSBEvents" in mro_names:
        return "events"
    if "BSBConfig" in mro_names:
        return "config"
    return "unknown"


def _has_method(plugin_cls: Any, method_name: str) -> bool:
    return callable(getattr(plugin_cls, method_name, None))


def build_capabilities(plugin_type: PluginType, plugin_cls: Any) -> dict[str, Any] | None:
    if plugin_type == "observable":
        return {
            "logging": {name: _has_method(plugin_cls, name) for name in OBSERVABLE_METHODS["logging"]},
            "metrics": {name: _has_method(plugin_cls, name) for name in OBSERVABLE_METHODS["metrics"]},
            "tracing": {name: _has_method(plugin_cls, name) for name in OBSERVABLE_METHODS["tracing"]},
        }
    if plugin_type == "events":
        return {"eventsApi": {name: _has_method(plugin_cls, name) for name in EVENTS_METHODS}}
    if plugin_type == "config":
        return {"configApi": {name: _has_method(plugin_cls, name) for name in CONFIG_METHODS}}
    return None


def discover_plugins(project_root: str | Path) -> list[DiscoveredPlugin]:
    source_root = Path(project_root) / "src"
    if not source_root.exists():
        return []

    plugins: list[DiscoveredPlugin] = []
    package_version = str(read_project_metadata(project_root).get("version") or "1.0.0")

    for file_path in sorted(source_root.rglob("*.py")):
        if file_path.name == "__init__.py":
            continue
        if "__pycache__" in file_path.parts:
            continue

        module = _import_module(source_root, file_path)
        plugin_cls = getattr(module, "Plugin", None)
        if plugin_cls is None:
            continue

        config_cls = getattr(module, "Config", None)
        metadata = getattr(config_cls, "metadata", {})
        if not isinstance(metadata, dict):
            metadata = {}

        plugin_id = _resolve_plugin_id(config_cls, file_path)
        plugin_type = infer_plugin_type(plugin_id, plugin_cls)
        if plugin_type == "unknown":
            continue

        version = str(getattr(module, "__version__", package_version))
        plugins.append(
            DiscoveredPlugin(
                plugin_id=plugin_id,
                plugin_type=plugin_type,
                plugin_cls=plugin_cls,
                config_cls=config_cls,
                module=module,
                source_path=file_path,
                metadata=metadata,
                version=version,
            )
        )

    return plugins


def export_schemas(project_root: str | Path) -> list[Path]:
    project_root = Path(project_root)
    output_dir = project_root / "lib" / "schemas"
    output_dir.mkdir(parents=True, exist_ok=True)
    project_meta = read_project_metadata(project_root)
    package_version = str(project_meta.get("version") or "1.0.0")
    written: list[Path] = []

    for plugin in discover_plugins(project_root):
        event_schemas = getattr(plugin.plugin_cls, "EventSchemas", None)
        export_doc = export_event_schemas(plugin.plugin_id, package_version, event_schemas)
        capabilities = build_capabilities(plugin.plugin_type, plugin.plugin_cls)
        if capabilities:
            export_doc["capabilities"] = capabilities

        config_schema = getattr(plugin.config_cls, "validation_schema", None)
        if config_schema is not None:
            export_doc["configSchema"] = config_schema.export("extended")

        output_path = output_dir / f"{plugin.plugin_id}.json"
        output_path.write_text(json.dumps(export_doc, indent=2), encoding="utf-8")
        written.append(output_path)

    return written


def build_plugin_manifest(project_root: str | Path) -> Path:
    project_root = Path(project_root)
    project_meta = read_project_metadata(project_root)
    plugins = discover_plugins(project_root)
    manifest_plugins: list[dict[str, Any]] = []

    for plugin in plugins:
        metadata = plugin.metadata
        category = str(metadata.get("category") or plugin.plugin_type)
        if category not in VALID_CATEGORIES:
            category = plugin.plugin_type

        config_schema = getattr(plugin.config_cls, "validation_schema", None)
        entry: dict[str, Any] = {
            "id": plugin.plugin_id,
            "name": metadata.get("displayName") or metadata.get("name") or plugin.plugin_id,
            "description": metadata.get("description") or project_meta.get("description", ""),
            "category": category,
            "tags": metadata.get("tags", []),
        }
        if config_schema is not None:
            entry["configSchema"] = config_schema.export("extended")
        for key in ("author", "license", "homepage", "repository", "documentation", "image", "links"):
            value = metadata.get(key)
            if value:
                entry[key] = value

        manifest_plugins.append(entry)

    manifest = {"python": manifest_plugins}
    manifest_path = project_root / "bsb-plugin.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest_path


def build_project(project_root: str | Path) -> dict[str, Any]:
    schema_paths = export_schemas(project_root)
    manifest_path = build_plugin_manifest(project_root)
    return {
        "schemas": schema_paths,
        "manifest": manifest_path,
    }


__all__ = [
    "DiscoveredPlugin",
    "build_capabilities",
    "build_plugin_manifest",
    "build_project",
    "discover_plugins",
    "export_schemas",
    "infer_plugin_type",
    "read_project_metadata",
]
