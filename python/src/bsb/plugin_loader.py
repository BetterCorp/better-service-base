from __future__ import annotations

import importlib
import importlib.util
import importlib.metadata
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any
from .versions import EXACT_VERSION, versions_equal


@dataclass(slots=True)
class LoadedPlugin:
    name: str
    plugin: Any
    service_config: Any
    package_cwd: str
    plugin_cwd: str
    plugin_path: str
    version: str


class SBPlugins:
    def __init__(self, cwd: str, dev_mode: bool) -> None:
        self.cwd = cwd
        self.dev_mode = dev_mode
        self.referenced_plugin_dir = os.environ.get("BSB_PLUGIN_DIR") or os.environ.get("BSB_PLUGINS_DIR")

    async def load_plugin(self, plugin_type: str, npm_package: str | None, plugin: str, name: str, version: str | None = None, language: str | None = None) -> LoadedPlugin:
        if language not in (None, "python"):
            raise ValueError("Cannot load another implementation language in the Python host")
        if not isinstance(plugin, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", plugin):
            raise ValueError("Invalid plugin identifier")
        if npm_package is not None and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", npm_package):
            raise ValueError("Invalid Python distribution name")
        if version is not None and (not isinstance(version, str) or not EXACT_VERSION.fullmatch(version)):
            raise ValueError("An exact semantic version is required")
        resolved = self._manifest_plugin(plugin, npm_package, version)
        if resolved is not None:
            module, plugin_cls, resolved_version = resolved
        elif npm_package:
            distribution = importlib.metadata.distribution(npm_package)
            if version is not None and not versions_equal(distribution.version, version):
                raise RuntimeError(f"Installed {npm_package} version does not match {version}")
            entries = [entry for entry in distribution.entry_points if entry.group == "bsb.plugins" and entry.name == plugin]
            if len(entries) != 1:
                raise RuntimeError(f"Distribution {npm_package} must declare one bsb.plugins entry point for {plugin}")
            plugin_cls = entries[0].load()
            module = sys.modules[plugin_cls.__module__]
            resolved_version = distribution.version
        else:
            module = self._resolve_module(plugin_type, None, plugin)
            plugin_cls = getattr(module, "Plugin", None)
            resolved_version = str(getattr(module, "__version__", "1.0.0"))
            if version is not None and not versions_equal(resolved_version, version):
                raise RuntimeError(f"Plugin {plugin} version does not match {version}")
        if plugin_cls is None:
            raise RuntimeError(f"Plugin class not exported: {plugin}")
        config_cls = getattr(module, "Config", None) or plugin_cls
        plugin_path = getattr(module, "__file__", "") or ""
        package_cwd = str(Path(plugin_path).parent.parent if plugin_path else Path(self.cwd))
        return LoadedPlugin(
            name=name,
            plugin=plugin_cls,
            service_config=config_cls,
            package_cwd=package_cwd,
            plugin_cwd=str(Path(plugin_path).parent if plugin_path else Path(self.cwd)),
            plugin_path=plugin_path,
            version=resolved_version,
        )

    def _manifest_plugin(self, plugin: str, package: str | None, version: str | None):
        roots = []
        if self.referenced_plugin_dir:
            root = Path(self.referenced_plugin_dir) / (package or plugin)
            roots.append(root / version if version else root)
        if package is None:
            roots.extend([Path(self.cwd), Path(self.cwd) / "plugins" / plugin])
        for root in roots:
            path = root / "bsb-plugin.json"
            if not path.is_file():
                continue
            manifest = json.loads(path.read_text(encoding="utf-8"))
            matches = [entry for entry in manifest.get("python", []) if entry.get("id") == plugin]
            if len(matches) > 1:
                raise ValueError("Duplicate plugin IDs in native manifest")
            if not matches or "path" not in matches[0]:
                continue
            entry = matches[0]
            if entry.get("language", "python") != "python" or version is not None and not versions_equal(str(entry.get("version", "")), version):
                raise ValueError("Plugin manifest language/version does not match configuration")
            file_path = (root / entry["path"]).resolve()
            if not file_path.is_relative_to(root.resolve()):
                raise ValueError("Plugin path escapes manifest directory")
            module = self._import_file(file_path)
            return module, getattr(module, entry.get("class", "Plugin")), str(entry.get("version", "1.0.0"))
        return None

    def _resolve_module(self, plugin_type: str, npm_package: str | None, plugin: str) -> ModuleType:
        # Application sources override bundled plugins.
        for root in [self.referenced_plugin_dir, str(Path(self.cwd) / "plugins")]:
            if root:
                file_path = Path(root) / plugin / "index.py"
                if file_path.is_file():
                    return self._import_file(file_path)
        plugin_mod = plugin.replace("-", "_")
        candidates: list[str] = []

        if npm_package:
            candidates.append(f"{npm_package}.{plugin_mod}")
        candidates.append(f"bsb_python_plugins.{plugin_mod}")

        last_error: Exception | None = None
        for module_name in candidates:
            try:
                return importlib.import_module(module_name)
            except ModuleNotFoundError as ex:
                if ex.name != module_name and not module_name.startswith(f"{ex.name}."):
                    raise
                last_error = ex

        if self.referenced_plugin_dir:
            ref = Path(self.referenced_plugin_dir)
            direct_file = ref / plugin / "index.py"
            type_file = ref / f"{plugin_type}-{plugin}" / "index.py"
            for file_path in [direct_file, type_file]:
                if file_path.exists():
                    return self._import_file(file_path)

        local_file = Path(self.cwd) / "plugins" / plugin / "index.py"
        if local_file.exists():
            return self._import_file(local_file)

        raise RuntimeError(f"Failed to resolve plugin {plugin}: {last_error}")

    def _import_file(self, file_path: Path) -> ModuleType:
        file_path = file_path.resolve()
        module_name = f"bsb_ext_{file_path.stem}_{abs(hash(file_path.as_posix()))}"
        if module_name in sys.modules:
            return sys.modules[module_name]
        spec = importlib.util.spec_from_file_location(module_name, file_path, submodule_search_locations=[str(file_path.parent)])
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Could not load plugin file: {file_path}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        try:
            spec.loader.exec_module(module)
        except BaseException:
            sys.modules.pop(module_name, None)
            raise
        return module
