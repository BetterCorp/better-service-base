from __future__ import annotations

from typing import Any

import anyvali as av


Schema = av.BaseSchema
AnyValiDocument = av.AnyValiDocument


def object_schema(
    properties: dict[str, av.BaseSchema[Any]],
    *,
    required: list[str] | None = None,
    unknown_keys: av.UnknownKeyMode = "strip",
) -> av.ObjectSchema:
    if required is None:
        required = [key for key, schema in properties.items() if not isinstance(schema, av.OptionalSchema)]
    return av.object_(properties, required=required, unknown_keys=unknown_keys)


def export_portable_schema(
    schema: av.BaseSchema[Any],
    *,
    extensions: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return av.export_schema(schema, mode="portable", extensions=extensions)


def export_extended_schema(
    schema: av.BaseSchema[Any],
    *,
    extensions: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return av.export_schema(schema, mode="extended", extensions=extensions)


def import_portable_schema(source: dict[str, Any] | str) -> av.BaseSchema[Any]:
    return av.import_schema(source)


def safe_parse(schema: av.BaseSchema[Any], input_value: Any) -> av.ParseResult[Any]:
    return av.safe_parse(schema, input_value)


def parse(schema: av.BaseSchema[Any], input_value: Any) -> Any:
    return schema.parse(input_value)


def client_value(document: dict, value: Any) -> Any:
    """Materialize tuple outputs while preserving omitted object fields and native JSON values."""
    definitions = document.get("definitions", {})

    def convert(node: dict, data: Any) -> Any:
        kind = node["kind"]
        if kind in ("nullable", "optional"):
            return None if data is None else convert(node.get("schema", node.get("inner")), data)
        if kind == "ref":
            return convert(definitions[node["ref"].removeprefix("#/definitions/")], data)
        if kind == "tuple":
            return tuple(convert(item, part) for item, part in zip(node.get("elements", node.get("items", [])), data))
        if kind == "array":
            return [convert(node["items"], item) for item in data]
        if kind == "record":
            return {key: convert(node.get("valueSchema", node.get("values")), item) for key, item in data.items()}
        if kind == "object":
            fields = node.get("properties", {})
            return {key: convert(fields[key], item) if key in fields else item for key, item in data.items()}
        if kind == "union":
            for variant in node.get("variants", node.get("schemas", [])):
                if import_portable_schema({**document, "root": variant}).safe_parse(data).success:
                    return convert(variant, data)
        if kind == "intersection":
            for member in node.get("allOf", node.get("schemas", [])):
                data = convert(member, data)
            return data
        return data

    return convert(document["root"], value)


__all__ = [
    "AnyValiDocument",
    "Schema",
    "av",
    "export_extended_schema",
    "export_portable_schema",
    "import_portable_schema",
    "object_schema",
    "parse",
    "safe_parse",
]
