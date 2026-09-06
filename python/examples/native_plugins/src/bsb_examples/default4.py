from bsb.base import BSBService
from bsb.schema import object_schema
from bsb.schema_events import import_event_schemas
from .clients.service_default4 import Default4Client

class Config:
    metadata = {"name": "service-default4", "category": "service"}
    validation_schema = object_schema({})

class Plugin(BSBService):
    EventSchemas = import_event_schemas(Default4Client.schema)
    async def run(self, trace): trace.info("Running service-default4")
