from __future__ import annotations

from typing import Any, Literal, TypedDict

from .schema import AnyValiDocument, Schema


EventType = Literal["fire-and-forget", "returnable", "broadcast"]
EventCategory = Literal[
    "emitEvents",
    "onEvents",
    "emitReturnableEvents",
    "onReturnableEvents",
    "emitBroadcast",
    "onBroadcast",
]


class FireAndForgetEventSchema(TypedDict, total=False):
    input: Schema
    description: str
    __brand: Literal["fire-and-forget"]


class ReturnableEventSchema(TypedDict, total=False):
    input: Schema
    output: Schema
    description: str
    default_timeout: float
    __brand: Literal["returnable"]


class BroadcastEventSchema(TypedDict, total=False):
    input: Schema
    description: str
    __brand: Literal["broadcast"]


AnyEventSchema = FireAndForgetEventSchema | ReturnableEventSchema | BroadcastEventSchema
CategorySchemaMap = dict[str, AnyEventSchema]
BSBEventSchemas = dict[str, CategorySchemaMap]


class EventExportDefinition(TypedDict, total=False):
    type: EventType
    category: EventCategory
    description: str
    defaultTimeout: float
    inputSchema: AnyValiDocument
    outputSchema: AnyValiDocument | None


class EventSchemaExport(TypedDict, total=False):
    pluginName: str
    version: str
    events: dict[str, EventExportDefinition]
    dependencies: list[dict[str, str]]
    capabilities: dict[str, Any]
    configSchema: dict[str, Any]


def create_fire_and_forget_event(input_schema: Schema, description: str | None = None) -> FireAndForgetEventSchema:
    event: FireAndForgetEventSchema = {"input": input_schema, "__brand": "fire-and-forget"}
    if description:
        event["description"] = description
    return event


def create_returnable_event(
    input_schema: Schema,
    output_schema: Schema,
    description: str | None = None,
    default_timeout: float | None = None,
) -> ReturnableEventSchema:
    event: ReturnableEventSchema = {
        "input": input_schema,
        "output": output_schema,
        "__brand": "returnable",
    }
    if description:
        event["description"] = description
    if default_timeout is not None:
        event["default_timeout"] = default_timeout
    return event


def create_broadcast_event(input_schema: Schema, description: str | None = None) -> BroadcastEventSchema:
    event: BroadcastEventSchema = {"input": input_schema, "__brand": "broadcast"}
    if description:
        event["description"] = description
    return event


def create_event_schemas(schemas: BSBEventSchemas) -> BSBEventSchemas:
    all_names: set[str] = set()
    duplicates: set[str] = set()
    for category in (
        "emitEvents",
        "onEvents",
        "emitReturnableEvents",
        "onReturnableEvents",
        "emitBroadcast",
        "onBroadcast",
    ):
        for name in schemas.get(category, {}).keys():
            if name in all_names:
                duplicates.add(name)
            all_names.add(name)

    if duplicates:
        duplicate_names = ", ".join(sorted(duplicates))
        print(
            "[BSB Warning] Duplicate event names detected: "
            f"{duplicate_names}. Consider unique names across categories."
        )

    return schemas


def get_event_definition(schemas: BSBEventSchemas | None, category: EventCategory, event_name: str) -> AnyEventSchema | None:
    if not schemas:
        return None
    return schemas.get(category, {}).get(event_name)


def export_event_schemas(plugin_name: str, version: str, schemas: BSBEventSchemas | None) -> EventSchemaExport:
    events: dict[str, EventExportDefinition] = {}
    if schemas:
        for category in (
            "emitEvents",
            "onEvents",
            "emitReturnableEvents",
            "onReturnableEvents",
            "emitBroadcast",
            "onBroadcast",
        ):
            for event_name, event_def in schemas.get(category, {}).items():
                output_schema = None
                event_type: EventType = event_def["__brand"]
                if event_type == "returnable":
                    output_schema = event_def["output"].export("extended")

                export_def: EventExportDefinition = {
                    "type": event_type,
                    "category": category,
                    "inputSchema": event_def["input"].export("extended"),
                    "outputSchema": output_schema,
                }
                if "description" in event_def:
                    export_def["description"] = event_def["description"]
                if event_type == "returnable" and "default_timeout" in event_def:
                    export_def["defaultTimeout"] = event_def["default_timeout"]

                events[event_name] = export_def

    return {
        "pluginName": plugin_name,
        "version": version,
        "events": events,
    }


__all__ = [
    "AnyEventSchema",
    "BSBEventSchemas",
    "BroadcastEventSchema",
    "CategorySchemaMap",
    "EventCategory",
    "EventExportDefinition",
    "EventSchemaExport",
    "EventType",
    "FireAndForgetEventSchema",
    "ReturnableEventSchema",
    "create_broadcast_event",
    "create_event_schemas",
    "create_fire_and_forget_event",
    "create_returnable_event",
    "export_event_schemas",
    "get_event_definition",
]
