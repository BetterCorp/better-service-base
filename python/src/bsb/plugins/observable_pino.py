from ..logging import LOG_FIELDS, StructuredLogging
from ..schema import object_schema

class Config:
    metadata = {"name": "observable-pino", "description": "Native JSON logging with numeric levels and redaction", "category": "observable"}
    validation_schema = object_schema(LOG_FIELDS)

class Plugin(StructuredLogging):
    numeric_level = True
