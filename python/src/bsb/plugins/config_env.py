import json
import os

from ..config_common import JsonConfig
from ..schema import object_schema


class Config:
    metadata = {"name": "config-env", "description": "BSB_CONFIG_JSON configuration", "category": "config"}
    validation_schema = object_schema({})


class Plugin(JsonConfig):
    async def init(self, trace) -> None:
        self.load(json.loads(os.environ["BSB_CONFIG_JSON"]), os.environ.get("BSB_PROFILE", "default"))
