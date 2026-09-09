from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

from bsb.client_generator import generate_clients
from bsb.schema_export import build_project


def _write_demo_project(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text(
        "\n".join(
            [
                "[build-system]",
                'requires = ["setuptools>=68", "wheel"]',
                'build-backend = "setuptools.build_meta"',
                "",
                "[project]",
                'name = "demo-bsb-plugin"',
                'version = "1.2.3"',
                'description = "Demo plugin project"',
                'requires-python = ">=3.11"',
                "",
            ]
        ),
        encoding="utf-8",
    )
    plugin_dir = tmp_path / "src" / "demo_pkg"
    plugin_dir.mkdir(parents=True, exist_ok=True)
    (plugin_dir / "__init__.py").write_text("", encoding="utf-8")
    (plugin_dir / "service_demo.py").write_text(
        "\n".join(
            [
                "from bsb.base import BSBService",
                "from bsb.schema import av, object_schema",
                "from bsb.schema_events import create_event_schemas, create_returnable_event",
                "",
                "class Config:",
                '    metadata = {"name": "service-demo", "description": "Demo service", "category": "service"}',
                '    validation_schema = object_schema({"count": av.int32()})',
                "",
                "class Plugin(BSBService):",
                "    EventSchemas = create_event_schemas({",
                '        "onReturnableEvents": {',
                '            "sum": create_returnable_event(',
                '                object_schema({"count": av.int32()}),',
                "                av.int32(),",
                '                "Return the count value",',
                "                default_timeout=4.0,",
                "            )",
                "        }",
                "    })",
                "",
            ]
        ),
        encoding="utf-8",
    )


@pytest.mark.parametrize("module_version", [None, "2.4.6"])
def test_build_project_exports_schemas_and_manifest(tmp_path: Path, monkeypatch, module_version) -> None:
    _write_demo_project(tmp_path)
    for name in ("demo_pkg", "demo_pkg.service_demo"):
        monkeypatch.delitem(sys.modules, name, raising=False)
    if module_version is not None:
        with (tmp_path / "src/demo_pkg/service_demo.py").open("a", encoding="utf-8") as module:
            module.write(f"\n__version__ = {module_version!r}\n")
    result = build_project(tmp_path)

    schema_path = tmp_path / "lib" / "schemas" / "service-demo.json"
    assert schema_path in result["schemas"]
    exported = json.loads(schema_path.read_text(encoding="utf-8"))
    assert exported["pluginName"] == "service-demo"
    assert exported["version"] == (module_version or "1.2.3")
    assert exported["events"]["sum"]["category"] == "onReturnableEvents"
    assert exported["configSchema"]["root"]["unknownKeys"] == "strip"

    manifest = json.loads(result["manifest"].read_text(encoding="utf-8"))
    assert manifest["python"][0]["id"] == "service-demo"
    assert manifest["python"][0]["category"] == "service"
    assert manifest["python"][0]["version"] == exported["version"]


def test_package_entry_point_manifest_loads(tmp_path: Path) -> None:
    import asyncio
    from bsb.plugin_loader import SBPlugins
    _write_demo_project(tmp_path)
    package = tmp_path / 'src' / 'package_entry_fixture'
    package.mkdir()
    package.joinpath('__init__.py').write_text((tmp_path / 'src/demo_pkg/service_demo.py').read_text())
    with (tmp_path / 'pyproject.toml').open('a') as project:
        project.write('\n[project.entry-points."bsb.plugins"]\nservice-demo = "package_entry_fixture:Plugin"\n')
    result = build_project(tmp_path)
    entry = json.loads(result['manifest'].read_text())['python'][0]
    assert entry['path'] == 'src/package_entry_fixture/__init__.py'
    loaded = asyncio.run(SBPlugins(str(tmp_path), False).load_plugin('service', None, 'service-demo', 'alias'))
    assert loaded.plugin.__name__ == 'Plugin'


def test_generate_clients_creates_service_client_module(tmp_path: Path) -> None:
    schemas_dir = tmp_path / "src" / ".bsb" / "schemas"
    schemas_dir.mkdir(parents=True, exist_ok=True)
    (schemas_dir / "service-demo.json").write_text(
        json.dumps(
            {
                "pluginName": "service-demo",
                "version": "1.2.3",
                "events": {
                    "sum": {
                        "type": "returnable",
                        "category": "onReturnableEvents",
                        "description": "Add numbers",
                        "defaultTimeout": 4.0,
                        "inputSchema": {"anyvaliVersion": "1.0", "schemaVersion": "1", "root": {"kind": "object"}},
                        "outputSchema": {"anyvaliVersion": "1.0", "schemaVersion": "1", "root": {"kind": "int32"}},
                    }
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    written = generate_clients(tmp_path)
    client_path = tmp_path / "src" / "bsb_clients" / "service_demo.py"
    assert client_path in written
    client_code = client_path.read_text(encoding="utf-8")
    assert "class DemoClient(ServiceClient):" in client_code
    assert "async def sum(self, payload: DemoClientSumInput, timeout_seconds: float = 4.0" in client_code
    compile(client_code, str(client_path), "exec")


def test_generate_clients_removes_only_obsolete_generated_modules(tmp_path: Path) -> None:
    schemas = tmp_path / ".bsb" / "schemas"
    clients = tmp_path / "bsb_clients"
    schemas.mkdir(parents=True)
    clients.mkdir()
    obsolete = clients / "old.py"
    obsolete.write_text("# Generated by BSB from the saved portable schema.\nold = True\n", encoding="utf-8")
    handwritten = clients / "custom.py"
    handwritten.write_text("custom = True\n", encoding="utf-8")

    generate_clients(tmp_path)

    assert not obsolete.exists()
    assert handwritten.read_text(encoding="utf-8") == "custom = True\n"
