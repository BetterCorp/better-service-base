import json

from bsb.base import BSBObservable
from bsb.schema import av, object_schema


class Config:
    metadata = {"name": "observable-default", "description": "Native structured console logging", "category": "observable"}
    validation_schema = object_schema({"level": av.enum_(["trace", "debug", "info", "warn", "error", "fatal"]).default("info")})


class Plugin(BSBObservable):
    def emit_log(self, entry: dict) -> None:
        levels = ["trace", "debug", "info", "warn", "error", "fatal"]
        if levels.index(entry["level"]) >= levels.index(self.config["level"]):
            print(json.dumps(entry, default=str, ensure_ascii=False), flush=True)
