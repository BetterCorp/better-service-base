from __future__ import annotations

from ..base import BSBService
from ..observable import Trace
from ..schema import av, object_schema
from ..schema_events import create_event_schemas, create_fire_and_forget_event, create_returnable_event


class Config:
    metadata = {
        "name": "service-default0",
        "description": "Default Python service example plugin.",
        "category": "service",
    }
    validation_schema = object_schema(
        {
            "testa": av.int32(),
            "testb": av.int32(),
        }
    )


class Plugin(BSBService):
    EventSchemas = create_event_schemas(
        {
            "emitEvents": {
                "test": create_fire_and_forget_event(
                    object_schema(
                        {
                            "a": av.string(),
                            "b": av.string(),
                        }
                    ),
                    "Emit a simple test event.",
                ),
            },
            "onReturnableEvents": {
                "calculate": create_returnable_event(
                    object_schema(
                        {
                            "a": av.int32(),
                            "b": av.int32(),
                        }
                    ),
                    av.int32(),
                    "Add two integers together.",
                    default_timeout=2.0,
                ),
            },
        }
    )
    init_before_plugins: list[str] = []
    init_after_plugins: list[str] = []
    run_before_plugins: list[str] = []
    run_after_plugins: list[str] = []

    async def init(self, trace: Trace) -> None:
        async def calculate(_trace: Trace, payload: object) -> int:
            if isinstance(payload, dict):
                return int(payload.get("a", 0)) + int(payload.get("b", 0))
            return 0

        await self.events.on_returnable_event("calculate", calculate)

    async def run(self, trace: Trace) -> None:
        cfg = self.config or {}
        await self.events.emit_event("test", {"a": "test", "b": "test"})
        result = await self.events.emit_event_and_return(
            "calculate",
            {"a": int(cfg.get("testa", 0)), "b": int(cfg.get("testb", 0))},
            timeout_seconds=2.0,
        )
        self._obs.info(trace, "Calculation result: {result}", {"result": result})
