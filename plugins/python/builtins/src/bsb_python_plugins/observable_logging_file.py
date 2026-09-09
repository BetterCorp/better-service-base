from bsb.logging import LOG_FIELDS, StructuredLogging
from bsb.schema import av, object_schema

class Config:
    metadata = {"name": "observable-logging-file", "description": "Native structured file logging with size/time rotation", "category": "observable"}
    validation_schema = object_schema({**LOG_FIELDS, "path": av.string().min_length(1).default("logs/application.log")})

class Plugin(StructuredLogging):
    file_only = True
