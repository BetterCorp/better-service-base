from __future__ import annotations

from bsb.schema import av, export_portable_schema, import_portable_schema, object_schema, safe_parse


def test_object_schema_strips_unknown_keys() -> None:
    schema = object_schema(
        {
            "name": av.string(),
            "count": av.optional(av.int32()).default(0),
        }
    )

    result = safe_parse(schema, {"name": "todo", "count": 2, "extra": "ignored"})

    assert result.success is True
    assert result.data == {"name": "todo", "count": 2}


def test_export_and_import_round_trip() -> None:
    schema = object_schema(
        {
            "id": av.string().format("uuid"),
            "enabled": av.optional(av.bool_()).default(True),
        }
    )

    document = export_portable_schema(schema)
    imported = import_portable_schema(document)
    result = imported.safe_parse(
        {
            "id": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
            "extra": "ignored",
        }
    )

    assert document["root"]["kind"] == "object"
    assert document["root"]["unknownKeys"] == "strip"
    assert result.success is True
    assert result.data == {
        "id": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
        "enabled": True,
    }
