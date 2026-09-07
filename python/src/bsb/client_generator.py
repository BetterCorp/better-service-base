from __future__ import annotations

import json
import keyword
import re
import tomllib
from pathlib import Path
from typing import Any

from .schema_events import FLIP_MAP, import_event_schemas


def event_name_to_method_name(name: str) -> str:
    value = re.sub(r"[^0-9a-zA-Z]+", "_", name).strip("_").lower() or "event"
    if value[0].isdigit():
        value = "event_" + value
    return value + "_" if keyword.iskeyword(value) else value


def plugin_name_to_class_name(name: str) -> str:
    parts = re.findall(r"[A-Za-z0-9]+", name.removeprefix("service-"))
    value = "".join(part[:1].upper() + part[1:] for part in parts) or "Plugin"
    return ("Plugin" if value[0].isdigit() else "") + value + "Client"


def generate_client_code(schema_export: dict[str, Any], plugin_id: str) -> str:
    import_event_schemas(schema_export)
    class_name = plugin_name_to_class_name(plugin_id)
    declarations: list[str] = []
    methods: list[str] = []
    used = {"__init__", "events", "context", "target_plugin_name", "schema"}
    types = {class_name}

    def shape(document: dict, hint: str) -> str:
        definitions = document.get("definitions", {})
        references = {key: f"{hint}Definition{i}" for i, key in enumerate(definitions)}
        seen = set()

        def native(node: dict, name: str) -> str:
            kind = node["kind"]
            if kind == "string":
                return "str"
            if kind == "bool":
                return "bool"
            if kind in ("int", "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64"):
                return "int"
            if kind in ("number", "float32", "float64"):
                return "float"
            if kind in ("any", "unknown"):
                return "Any"
            if kind == "null":
                return "None"
            if kind == "never":
                return "Never"
            if kind in ("optional", "nullable"):
                return f"Union[{native(node.get('schema', node.get('inner')), name)}, None]"
            if kind == "array":
                return f"list[{native(node['items'], name + 'Item')}]"
            if kind == "record":
                return f"dict[str, {native(node.get('valueSchema', node.get('values')), name + 'Value')}]"
            if kind == "tuple":
                elements = [native(element, name + str(i)) for i, element in enumerate(node.get("elements", node.get("items", [])))]
                return "tuple[" + (", ".join(elements) if elements else "()") + "]"
            if kind == "union":
                return "Union[" + ", ".join(native(value, name + "Variant" + str(i)) for i, value in enumerate(node.get("variants", node.get("schemas", [])))) + "]"
            if kind == "intersection":
                values = node.get("allOf", node.get("schemas", []))
                if all(value["kind"] == "object" for value in values):
                    properties = {key: value for member in values for key, value in member.get("properties", {}).items()}
                    required = list({key for member in values for key in member.get("required", [])})
                    return native({"kind": "object", "properties": properties, "required": required}, name)
                return native(values[-1], name)
            if kind in ("enum", "literal"):
                values = node["values"] if kind == "enum" else [node.get("value")]
                parts = ["float" if type(value) is float else f"Literal[{value!r}]" for value in values]
                return parts[0] if len(parts) == 1 else "Union[" + ", ".join(parts) + "]"
            if kind == "ref":
                key = node["ref"].removeprefix("#/definitions/")
                if key not in references:
                    raise ValueError(f"Unknown schema definition {key}")
                reference = references[key]
                if key not in seen:
                    seen.add(key)
                    resolved = native(definitions[key], reference)
                    if resolved != reference:
                        declarations.append(f"{reference}: TypeAlias = {resolved}")
                return repr(reference)
            if kind == "object":
                if name in types:
                    raise ValueError(f"Generated type collision {name}")
                types.add(name)
                required = set(node.get("required", []))
                fields = {}
                for key, value in node.get("properties", {}).items():
                    optional = key not in required or value["kind"] == "optional"
                    item_type = native(value.get("schema", value.get("inner")) if value["kind"] == "optional" else value, name + plugin_name_to_class_name(key).removesuffix("Client"))
                    fields[key] = f"NotRequired[{item_type}]" if optional else item_type
                declarations.append(f"{name} = TypedDict({name!r}, {fields!r})")
                return name
            raise ValueError(f"Unsupported client schema kind {kind}")

        return native(document["root"], hint)

    for event, definition in sorted(schema_export["events"].items()):
        category = FLIP_MAP[definition["category"]]
        method = event_name_to_method_name(event)
        listens = category.startswith("on")
        if listens:
            method = "on_" + method
        elif category == "emitBroadcast":
            method = "emit_" + method
        if method in used:
            raise ValueError(f"Generated method collision {method}")
        used.add(method)
        hint = class_name + plugin_name_to_class_name(method).removesuffix("Client")
        input_type = shape(definition["inputSchema"], hint + "Input")
        output_type = shape(definition["outputSchema"], hint + "Output") if definition.get("outputSchema") is not None else "None"
        specific = "" if definition["type"] == "broadcast" else ", server_id: str | None = None"
        forward = "" if definition["type"] == "broadcast" else ", server_id=server_id"
        if listens:
            operation = {"onEvents": "on_event", "onReturnableEvents": "on_returnable_event", "onBroadcast": "on_broadcast"}[category]
            methods.extend([f"    async def {method}(self, handler: Callable[[Trace, {input_type}], Awaitable[{output_type}]], *, obs: Trace | None = None{specific}) -> None:",
                "        async def wrapped(trace, payload):",
                f"            return await handler(trace, client_value(self.schema['events'][{event!r}]['inputSchema'], payload))",
                f"        await self.events.{operation}({event!r}, wrapped, obs=obs{forward})", ""])
        elif category == "emitReturnableEvents":
            timeout = definition.get("defaultTimeout", 5)
            methods.extend([f"    async def {method}(self, payload: {input_type}, timeout_seconds: float = {timeout!r}, *, obs: Trace | None = None{specific}) -> {output_type}:",
                f"        value = await self.events.emit_event_and_return({event!r}, payload, timeout_seconds=timeout_seconds, obs=obs{forward})",
                f"        return cast({output_type!r}, client_value(self.schema['events'][{event!r}]['outputSchema'], value))", ""])
        else:
            operation = "emit_event" if category == "emitEvents" else "emit_broadcast"
            methods.extend([f"    async def {method}(self, payload: {input_type}, *, obs: Trace | None = None{specific}) -> None:",
                f"        await self.events.{operation}({event!r}, payload, obs=obs{forward})", ""])
    target = schema_export.get("pluginId") or schema_export.get("pluginName") or plugin_id
    return "\n".join([
        "# Generated by BSB from the saved portable schema.", "from __future__ import annotations", "import json",
        "from typing import Any, Awaitable, Callable, Literal, Never, NotRequired, TypeAlias, TypedDict, Union, cast",
        "from bsb.base import BSBService, ServiceClient", "from bsb.observable import Trace", "from bsb.schema import client_value", "",
        *declarations, "", f"class {class_name}(ServiceClient):",
        f"    schema = json.loads({json.dumps(schema_export, ensure_ascii=True)!r})", "",
        "    def __init__(self, context: BSBService, target_plugin_name: str | None = None) -> None:",
        f"        super().__init__(target_plugin_name or {target!r}, context, self.schema)", "", *methods])


def ensure_generated_layout(project_root: str | Path) -> tuple[Path, Path]:
    root = Path(project_root)
    schemas = root / ".bsb" / "schemas"
    project = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8")) if (root / "pyproject.toml").exists() else {}
    package = project.get("tool", {}).get("bsb", {}).get("clients-package", "bsb_clients")
    if not isinstance(package, str) or any(not part.isidentifier() or keyword.iskeyword(part) for part in package.split(".")):
        raise ValueError("Invalid generated clients package")
    clients = (root / "src" if (root / "src").is_dir() else root).joinpath(*package.split("."))
    schemas.mkdir(parents=True, exist_ok=True)
    clients.mkdir(parents=True, exist_ok=True)
    return schemas, clients


def validate_client_names(values) -> None:
    names, classes = set(), set()
    for value in values:
        name, cls = event_name_to_method_name(value), plugin_name_to_class_name(value)
        if name in names or cls in classes:
            raise ValueError("Installed client names collide after Python normalization")
        names.add(name)
        classes.add(cls)


def generate_clients(project_root: str | Path) -> list[Path]:
    schemas_dir, clients_dir = ensure_generated_layout(project_root)
    files = sorted(schemas_dir.glob("*.json"))
    legacy = Path(project_root) / "src" / ".bsb" / "schemas"
    files += sorted(legacy.glob("*.json"))
    validate_client_names([file.stem for file in files])
    generated = []
    for file in files:
        name = event_name_to_method_name(file.stem)
        cls = plugin_name_to_class_name(file.stem)
        code = generate_client_code(json.loads(file.read_text(encoding="utf-8")), file.stem)
        generated.append((clients_dir / (name + ".py"), cls, code))
    current = {path for path, _, _ in generated}
    for path in clients_dir.glob("*.py"):
        if path.name != "__init__.py" and path not in current and path.read_text(encoding="utf-8").startswith("# Generated by BSB from the saved portable schema.\n"):
            path.unlink()
    for path, _, code in generated:
        path.write_text(code, encoding="utf-8")
    (clients_dir / "__init__.py").write_text("\n".join(f"from .{path.stem} import {cls} as {cls}" for path, cls, _ in generated) + "\n", encoding="utf-8")
    return [path for path, _, _ in generated]
