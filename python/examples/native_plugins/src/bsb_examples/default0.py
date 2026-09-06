from bsb.base import BSBService
from bsb.schema import av, object_schema
from bsb.schema_events import import_event_schemas
from .clients.service_default0 import Default0Client

class Config:
    metadata = {"name": "service-default0", "category": "service"}
    validation_schema = object_schema({"testa": av.number().min(0).default(0), "testb": av.number().min(0).default(0)})

class Plugin(BSBService):
    EventSchemas = import_event_schemas(Default0Client.schema)
    async def run(self, trace):
        await self.events.emit_event("test", {"a": "test", "b": "test"}, obs=trace)
        result = await self.events.emit_event_and_return("calculate", {"a": self.config["testa"], "b": self.config["testb"]}, obs=trace)
        trace.info("Calculation result: {result}", {"result": result})
