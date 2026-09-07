from datetime import datetime, timezone
from bsb.base import BSBService
from bsb.schema import object_schema
from bsb.schema_events import import_event_schemas
from .contracts import load_contract

class Config:
    metadata = {"name": "service-default1", "category": "service"}
    validation_schema = object_schema({})

class Plugin(BSBService):
    EventSchemas = import_event_schemas(load_contract("service-default1"))
    def __init__(self, ctor):
        super().__init__(ctor)
        from .clients.service_default0 import Default0Client
        self.zero = Default0Client(self)

    async def init(self, trace):
        async def calculate(span, value): return value["a"] * value["b"]
        async def test(span, value): span.info(value["a"] + value["b"])
        async def transform(span, value):
            text = value["text"]
            return {"uppercase": str.upper, "lowercase": str.lower, "reverse": lambda value: value[::-1], "capitalize": str.capitalize}[value["transformation"]](text)
        async def received(span, value):
            await self.events.emit_event("data.processed", {"itemId": value["itemId"], "result": {"processed": True, "timestamp": datetime.now(timezone.utc).isoformat()}, "processingTime": 0}, obs=span)
        async def updated(span, value): span.info("Configuration updated")
        await self.zero.on_calculate(calculate, obs=trace)
        await self.zero.on_test(test, obs=trace)
        await self.events.on_returnable_event("calculate", calculate, obs=trace)
        await self.events.on_returnable_event("text.transform", transform, obs=trace)
        await self.events.on_event("data.received", received, obs=trace)
        await self.events.on_broadcast("config.updated", updated, obs=trace)
