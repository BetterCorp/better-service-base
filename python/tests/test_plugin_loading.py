import asyncio
import json
import sys
from types import SimpleNamespace
import pytest
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

def test_prerelease_manifest_distribution_and_installer(tmp_path, monkeypatch):
    from bsb import packages, plugin_loader
    root = tmp_path / "local"
    root.mkdir()
    (root / "plugin.py").write_text("class Plugin: pass\n")
    manifest = {"python": [{"id": "service-demo", "path": "plugin.py", "version": "1.2.3-beta.1"}]}
    (root / "bsb-plugin.json").write_text(json.dumps(manifest))
    local = asyncio.run(SBPlugins(str(root), False).load_plugin("service", None, "service-demo", "alias", "1.2.3-beta.1"))
    assert local.version == "1.2.3-beta.1"
    entry = SimpleNamespace(group="bsb.plugins", name="service-demo", load=lambda: local.plugin)
    distribution = SimpleNamespace(version="1.2.3b1", entry_points=[entry])
    monkeypatch.setattr(plugin_loader.importlib.metadata, "distribution", lambda _: distribution)
    installed = asyncio.run(SBPlugins(str(tmp_path), False).load_plugin("service", "demo-package", "service-demo", "alias", "1.2.3-beta.1"))
    assert installed.plugin is local.plugin
    with pytest.raises(RuntimeError, match="does not match"):
        asyncio.run(SBPlugins(str(tmp_path), False).load_plugin("service", "demo-package", "service-demo", "alias", "1.2.3-beta.2"))
    for invalid in ("1.2", "1.2.3-beta/escape", "1.2.3\n"):
        with pytest.raises(ValueError):
            asyncio.run(SBPlugins(str(root), False).load_plugin("service", None, "service-demo", "alias", invalid))
    monkeypatch.setattr(sys, "prefix", str(tmp_path / "venv"))
    commands = []
    monkeypatch.setattr(packages.subprocess, "run", lambda args, **_: commands.append(args))
    monkeypatch.setattr(packages.importlib.metadata, "distribution", lambda _: distribution)
    packages.install("demo-package", "1.2.3-beta.1")
    assert commands[0][-1] == "demo-package==1.2.3b1"
    distribution.entry_points = []
    with pytest.raises(ValueError, match="does not declare bsb.plugins"):
        packages.install("ordinary-package", "1.2.3")
    assert commands[-1][-1] == "ordinary-package==1.2.3"
