from bsb.logging import LOG_FIELDS, StructuredLogging
from bsb.schema import object_schema

class Config:
    metadata = {"name": "observable-winston", "description": "Native console and rotating file logging", "category": "observable"}
    validation_schema = object_schema(LOG_FIELDS)

class Plugin(StructuredLogging):
    pass
