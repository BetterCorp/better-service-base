from __future__ import annotations

import importlib
import importlib.util
import os
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any


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
        self.referenced_plugin_dir = os.environ.get("BSB_PLUGIN_DIR")

    async def load_plugin(self, plugin_type: str, npm_package: str | None, plugin: str, name: str) -> LoadedPlugin:
        module = self._resolve_module(plugin_type, npm_package, plugin)
        plugin_cls = getattr(module, "Plugin", None)
        if plugin_cls is None:
            raise RuntimeError(f"Plugin class not exported: {plugin}")
        config_cls = getattr(module, "Config", None)
        plugin_path = getattr(module, "__file__", "") or ""
        package_cwd = str(Path(plugin_path).parent.parent if plugin_path else Path(self.cwd))
        return LoadedPlugin(
            name=name,
            plugin=plugin_cls,
            service_config=config_cls,
            package_cwd=package_cwd,
            plugin_cwd=str(Path(plugin_path).parent if plugin_path else Path(self.cwd)),
            plugin_path=plugin_path,
            version=str(getattr(module, "__version__", "1.0.0")),
        )

    def _resolve_module(self, plugin_type: str, npm_package: str | None, plugin: str) -> ModuleType:
        plugin_mod = plugin.replace("-", "_")
        candidates: list[str] = []

        if npm_package:
            candidates.append(f"{npm_package}.{plugin_mod}")
        candidates.append(f"bsb.plugins.{plugin_mod}")

        last_error: Exception | None = None
        for module_name in candidates:
            try:
                return importlib.import_module(module_name)
            except Exception as ex:  # pragma: no cover - fallback path
                last_error = ex

        if self.referenced_plugin_dir:
            ref = Path(self.referenced_plugin_dir)
            direct_file = ref / plugin / "index.py"
            type_file = ref / f"{plugin_type}-{plugin}" / "index.py"
            for file_path in [direct_file, type_file]:
                if file_path.exists():
                    return self._import_file(file_path)

        raise RuntimeError(f"Failed to resolve plugin {plugin}: {last_error}")

    def _import_file(self, file_path: Path) -> ModuleType:
        module_name = f"bsb_ext_{file_path.stem}_{abs(hash(file_path.as_posix()))}"
        spec = importlib.util.spec_from_file_location(module_name, file_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Could not load plugin file: {file_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
