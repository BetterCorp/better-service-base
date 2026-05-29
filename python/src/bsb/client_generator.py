from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


FLIP_MAP = {
    "emitEvents": "onEvents",
    "onEvents": "emitEvents",
    "emitReturnableEvents": "onReturnableEvents",
    "onReturnableEvents": "emitReturnableEvents",
    "emitBroadcast": "onBroadcast",
    "onBroadcast": "emitBroadcast",
}


def event_name_to_method_name(event_name: str) -> str:
    normalized = re.sub(r"[^0-9a-zA-Z]+", "_", event_name).strip("_")
    if not normalized:
        return "event"
    if normalized[0].isdigit():
        normalized = f"event_{normalized}"
    return normalized.lower()


def plugin_name_to_class_name(plugin_id: str) -> str:
    name = plugin_id.removeprefix("service-")
    parts = [part for part in re.split(r"[^0-9a-zA-Z]+", name) if part]
    if not parts:
        return "PluginClient"
    return "".join(part[:1].upper() + part[1:] for part in parts) + "Client"


def generate_client_code(schema_export: dict[str, Any], plugin_id: str) -> str:
    class_name = plugin_name_to_class_name(plugin_id)
    lines = [
        "from __future__ import annotations",
        "",
        "from typing import Any, Awaitable, Callable",
        "",
        "from bsb.base import BSBService, ServiceClient",
        "from bsb.observable import Trace",
        "",
        f"class {class_name}(ServiceClient):",
        f"    \"\"\"Auto-generated BSB client for {schema_export.get('pluginName', plugin_id)}.\"\"\"",
        "",
        "    def __init__(self, context: BSBService, target_plugin_name: str | None = None) -> None:",
        f"        super().__init__(target_plugin_name or {plugin_id!r}, context)",
    ]

    categorized_events: dict[str, list[tuple[str, dict[str, Any]]]] = {key: [] for key in FLIP_MAP}
    for event_name, event_def in sorted(schema_export.get("events", {}).items()):
        category = event_def.get("category")
        if category in categorized_events:
            categorized_events[category].append((event_name, event_def))

    for category, events in categorized_events.items():
        client_category = FLIP_MAP[category]
        for event_name, event_def in events:
            method_name = event_name_to_method_name(event_name)
            description = event_def.get("description") or event_name
            lines.append("")
            lines.append(f"    # {description}")
            if client_category == "emitEvents":
                lines.append(f"    async def {method_name}(self, payload: Any) -> None:")
                lines.append(f"        await self.events.emit_event({event_name!r}, payload)")
                continue

            if client_category == "emitReturnableEvents":
                timeout = float(event_def.get('defaultTimeout', 5.0))
                lines.append(
                    f"    async def {method_name}(self, payload: Any, timeout_seconds: float = {timeout}) -> Any:"
                )
                lines.append(
                    f"        return await self.events.emit_event_and_return({event_name!r}, payload, timeout_seconds=timeout_seconds)"
                )
                continue

            if client_category == "emitBroadcast":
                emit_name = f"emit_{method_name}"
                lines.append(f"    async def {emit_name}(self, payload: Any) -> None:")
                lines.append(f"        await self.events.emit_broadcast({event_name!r}, payload)")
                continue

            if client_category == "onEvents":
                on_name = f"on_{method_name}"
                lines.append(
                    f"    async def {on_name}(self, handler: Callable[[Trace, Any], Awaitable[None]]) -> None:"
                )
                lines.append(f"        await self.events.on_event({event_name!r}, handler)")
                continue

            if client_category == "onReturnableEvents":
                on_name = f"on_{method_name}"
                lines.append(
                    f"    async def {on_name}(self, handler: Callable[[Trace, Any], Awaitable[Any]]) -> None:"
                )
                lines.append(f"        await self.events.on_returnable_event({event_name!r}, handler)")
                continue

            if client_category == "onBroadcast":
                on_name = f"on_{method_name}"
                lines.append(
                    f"    async def {on_name}(self, handler: Callable[[Trace, Any], Awaitable[None]]) -> None:"
                )
                lines.append(f"        await self.events.on_broadcast({event_name!r}, handler)")

    lines.append("")
    return "\n".join(lines)


def ensure_generated_layout(project_root: str | Path) -> tuple[Path, Path]:
    root = Path(project_root)
    schemas_dir = root / "src" / ".bsb" / "schemas"
    clients_dir = root / "src" / ".bsb" / "clients"
    schemas_dir.mkdir(parents=True, exist_ok=True)
    clients_dir.mkdir(parents=True, exist_ok=True)
    return schemas_dir, clients_dir


def generate_clients(project_root: str | Path) -> list[Path]:
    schemas_dir, clients_dir = ensure_generated_layout(project_root)
    written: list[Path] = []

    for schema_file in sorted(schemas_dir.glob("*.json")):
        schema_export = json.loads(schema_file.read_text(encoding="utf-8"))
        if not schema_export.get("events"):
            continue
        plugin_id = schema_file.stem
        client_code = generate_client_code(schema_export, plugin_id)
        output_path = clients_dir / f"{plugin_id}.py"
        output_path.write_text(client_code, encoding="utf-8")
        written.append(output_path)

    init_path = clients_dir / "__init__.py"
    exports = [plugin_name_to_class_name(path.stem) for path in written]
    init_lines = [f"from .{path.stem} import {plugin_name_to_class_name(path.stem)}" for path in written]
    init_lines.append("")
    init_lines.append(f"__all__ = {exports!r}")
    init_path.write_text("\n".join(init_lines), encoding="utf-8")
    return written


__all__ = [
    "ensure_generated_layout",
    "event_name_to_method_name",
    "generate_client_code",
    "generate_clients",
    "plugin_name_to_class_name",
]
