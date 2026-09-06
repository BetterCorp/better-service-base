from bsb.base import BSBService
from bsb.schema import object_schema
from bsb.schema_events import import_event_schemas
from .clients.service_default3 import Default3Client

class Config:
    metadata = {"name": "service-default3", "category": "service"}
    validation_schema = object_schema({})

class Plugin(BSBService):
    EventSchemas = import_event_schemas(Default3Client.schema)
    init_after_plugins = ["service-default2"]
    async def init(self, trace):
        async def reverse(span, value): return value["text"][::-1]
        await self.events.on_returnable_event("onReverseReturnable", reverse, obs=trace)
    async def run(self, trace):
        result = await self.events.emit_event_and_return("calculate", {"a": 18, "b": 19}, obs=trace)
        trace.info("Calculation result: {result}", {"result": result})
