from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import yaml

from ..base import BSBError
from ..config_common import JsonConfig
from ..schema import object_schema


class Config:
    metadata = {"name": "config-default", "description": "Native JSON/YAML configuration", "category": "config"}
    validation_schema = object_schema({})


class Plugin(JsonConfig):
    async def init(self, trace) -> None:
        filename = os.environ.get("BSB_CONFIG_FILE")
        path = Path(self.cwd) / filename if filename else next(
            (Path(self.cwd) / name for name in ("bsb-config.json", "sec-config.yaml", "sec-config.json") if (Path(self.cwd) / name).exists()),
            Path(self.cwd) / "bsb-config.json")
        if not path.is_file():
            raise BSBError(f"Cannot find config file at {path}")
        text = await asyncio.to_thread(path.read_text, encoding="utf-8")
        if path.suffix.lower() == ".json":
            document = json.loads(text)
        elif path.suffix.lower() in {".yaml", ".yml"}:
            document = yaml.safe_load(text)
        else:
            raise BSBError("Configuration must use JSON or YAML")
        self.load(document, os.environ.get("BSB_PROFILE", "default"))
