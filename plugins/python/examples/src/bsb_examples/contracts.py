"""Portable example contracts copied into this package during a plugin build."""
from importlib.resources import files
import json


def load_contract(plugin_id: str) -> dict:
    return json.loads(files("bsb_examples").joinpath("contracts", plugin_id + ".json").read_text(encoding="utf-8"))
