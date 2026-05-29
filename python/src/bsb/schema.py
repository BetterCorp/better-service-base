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
