import asyncio
from bsb.plugin_loader import SBPlugins


def test_host_discovers_plugin_with_relative_imports_and_dataclasses(tmp_path):
    directory = tmp_path / "plugins" / "service-local"
    directory.mkdir(parents=True)
    (directory / "helper.py").write_text("VALUE = 'loaded'\n")
    (directory / "index.py").write_text(
        "from __future__ import annotations\n"
        "from dataclasses import dataclass\n"
        "from .helper import VALUE\n"
        "@dataclass\n"
        "class Plugin:\n"
        "    value: str = VALUE\n"
    )
    loader = SBPlugins(str(tmp_path), dev_mode=False)
    loaded = asyncio.run(loader.load_plugin("service", None, "service-local", "alias"))
    again = asyncio.run(loader.load_plugin("service", None, "service-local", "second-alias"))
    assert loaded.plugin().value == "loaded"
    assert loaded.plugin is again.plugin
    assert loaded.name == "alias"
