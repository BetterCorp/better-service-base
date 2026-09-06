from bsb.base import BSBService
from bsb.schema import object_schema
from bsb.schema_events import import_event_schemas
from .clients.service_default1 import Default1Client
from .clients.service_default2 import Default2Client
from .clients.service_default3 import Default3Client

class Config:
    metadata = {"name": "service-default2", "category": "service"}
    validation_schema = object_schema({})

class Plugin(BSBService):
    EventSchemas = import_event_schemas(Default2Client.schema)
    def __init__(self, ctor):
        super().__init__(ctor)
        self.one, self.three = Default1Client(self), Default3Client(self)

    async def init(self, trace):
        async def calculate(span, value): return value["a"] * value["b"]
        await self.events.on_returnable_event("calculate", calculate, obs=trace)
        await self.three.on_calculate(calculate, obs=trace)

    async def run(self, trace):
        trace.info("Calculation result: {result}", {"result": await self.one.calculate({"a": 5, "b": 5}, obs=trace)})
