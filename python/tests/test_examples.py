import asyncio
import json
from pathlib import Path
import socket
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from bsb.interfaces import BSBOptions
from bsb.schema_export import build_project
from bsb.service_base import ServiceBase


def test_native_examples_manifest_clients_http_and_persistence(tmp_path, monkeypatch):
    root = Path(__file__).parents[1] / "examples" / "native_plugins"
    build_project(root)
    manifest = json.loads((root / "bsb-plugin.json").read_text())
    assert len(manifest["python"]) == 7
    # Application manifests can reference the same package's source files before wheel installation.
    for entry in manifest["python"]:
        entry["path"] = str((root / entry["path"]).resolve())
    # Use a project cwd for trusted manifest paths, and an absolute temp storage path.
    config = json.loads((root / "bsb-config.json").read_text())
    for definition in config["services"].values():
        definition.pop("package", None)
    config["services"]["service-default0"]["config"] = {"testa": 5, "testb": 3}
    config["services"]["service-benchmarkify"].update(enabled=True, config={"iterations": 2})
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    storage = tmp_path / "todos.json"
    config["services"]["service-demo-todo"]["config"] = {"storage": {"path": str(storage)},
        "http": {"host": "127.0.0.1", "port": port, "cors": False}, "features": {"statsInterval": 0}}
    monkeypatch.setenv("BSB_CONFIG_PLUGIN", "config-env")
    monkeypatch.setenv("BSB_CONFIG_JSON", json.dumps(config))
    def http(method, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        request = Request(f"http://127.0.0.1:{port}" + path, data=data, headers={"Content-Type": "application/json"}, method=method)
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, response.read()
    async def check():
        app = ServiceBase(BSBOptions(cwd=str(root), mode="development", app_id="examples"))
        await app.init()
        try:
            await app.run()
            status, body = await asyncio.to_thread(http, "POST", "/api/todos", {"title": "Native Python"})
            assert status == 201, body
            todo = json.loads(body)
            status, body = await asyncio.to_thread(http, "PATCH", "/api/todos/" + todo["id"], {"completed": True, "id": "00000000-0000-0000-0000-000000000000"})
            assert status == 200 and json.loads(body)["id"] == todo["id"]
            status, body = await asyncio.to_thread(http, "GET", "/api/todos")
            assert status == 200 and json.loads(body)["total"] == 1
            assert (await asyncio.to_thread(http, "POST", "/api/todos", {"title": ""}))[0] == 400
            assert (await asyncio.to_thread(http, "POST", "/api/todos", {"title": "x" * 70000}))[0] == 413
            assert b"<!DOCTYPE html>" in (await asyncio.to_thread(http, "GET", "/"))[1]
            waiter = asyncio.create_task(app.wait_for_shutdown())
            await asyncio.sleep(.01)
            assert not waiter.done()
            app.request_shutdown()
            await waiter
        finally:
            await app.dispose()
        saved = json.loads(storage.read_text())
        assert len(saved) == 1 and saved[0]["completed"]
    asyncio.run(check())
