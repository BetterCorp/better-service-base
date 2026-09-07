import json
from copy import deepcopy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.error import HTTPError

import pytest

from bsb import hosted_client, registry_client
from bsb.cli import main


@pytest.fixture
def hosted_server():
    state = {"requests": [], "discovery": {"bsb": 1, "plugins": []}, "schemas": {}, "redirect": False}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass

        def do_GET(self):
            state["requests"].append((self.path, dict(self.headers)))
            if state["redirect"] and self.path == "/.well-known/bsb":
                self.send_response(302)
                self.send_header("Location", "/.well-known/bsb")
                self.end_headers()
                return
            body = state["discovery"] if self.path == "/.well-known/bsb" else state["schemas"].get(self.path)
            if body is None:
                self.send_response(404)
                self.end_headers()
                return
            data = json.dumps(body).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield state, f"http://127.0.0.1:{server.server_port}", server
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_hosted_install_inline_link_reinstall_and_offline_sync(tmp_path, monkeypatch, hosted_server):
    state, url, server = hosted_server
    inline = json.loads((Path(__file__).parents[2] / "tests" / "fixtures" / "hosted-discovery.json").read_text())
    linked_schema = deepcopy(inline["plugins"][0]["schema"])
    linked_schema["pluginId"] = "service-linked"
    linked_schema["version"] = "1.2.3"
    state["discovery"] = {"bsb": 1, "plugins": [inline["plugins"][0], {
        "id": "acme/service-linked", "language": "nodejs", "version": "1.2.3", "schema": "/contracts/linked.json"}]}
    state["schemas"] = {"/contracts/linked.json": linked_schema}
    monkeypatch.setattr(registry_client, "REGISTRY_TOKEN", "private-read-token")
    monkeypatch.chdir(tmp_path)

    with pytest.raises(ValueError, match="Multiple"):
        hosted_client.install_hosted_plugin(url, tmp_path, allow_insecure=True)
    assert main(["client", "install", url, "--allow-insecure", "--plugin", "acme/service-reports"]) == 0
    origin_hash = hosted_client.hashlib.sha256(url.encode()).hexdigest()[:16]
    inline_path = tmp_path / ".bsb" / "schemas" / f"hosted~{origin_hash}~acme~service-reports~nodejs.json"
    saved = json.loads(inline_path.read_text())
    assert saved["source"] == {"url": url, "org": "acme", "name": "service-reports", "language": "nodejs", "version": "1.2.3-beta.1"}
    assert "Authorization" not in state["requests"][0][1]
    assert main(["client", "install", url, "--allow-insecure", "--plugin", "acme/service-linked"]) == 0
    assert (tmp_path / ".bsb" / "schemas" / f"hosted~{origin_hash}~acme~service-linked~nodejs.json").exists()

    state["discovery"]["plugins"][0]["version"] = "1.2.4"
    state["discovery"]["plugins"][0]["schema"]["version"] = "1.2.4"
    assert main(["client", "install", url, "--allow-insecure", "--plugin", "acme/service-reports"]) == 0
    assert json.loads(inline_path.read_text())["source"]["version"] == "1.2.4"
    request_count = len(state["requests"])
    server.shutdown()
    assert main(["client", "sync"]) == 0
    assert len(state["requests"]) == request_count


def test_hosted_discovery_validates_metadata_links_and_redirects(tmp_path, hosted_server):
    state, url, _ = hosted_server
    schema = {"pluginId": "service-demo", "events": {}}
    state["discovery"] = {"bsb": 2, "plugins": []}
    with pytest.raises(ValueError, match="Invalid hosted"):
        hosted_client.install_hosted_plugin(url, tmp_path, allow_insecure=True)
    state["discovery"] = {"bsb": True, "plugins": []}
    with pytest.raises(ValueError, match="Invalid hosted"):
        hosted_client.install_hosted_plugin(url, tmp_path, allow_insecure=True)
    state["discovery"] = {"bsb": 1, "plugins": [{"id": "service-demo", "language": "nodejs", "version": "1.2.3", "schema": schema}] * 129}
    with pytest.raises(ValueError, match="128"):
        hosted_client.install_hosted_plugin(url, tmp_path, allow_insecure=True)
    state["discovery"] = {"bsb": 1, "plugins": [
        {"id": "service-demo", "language": "nodejs", "version": "1.2.3", "schema": schema},
        {"id": "_/service-demo", "language": "nodejs", "version": "1.2.3", "schema": schema},
    ]}
    with pytest.raises(ValueError, match="duplicate"):
        hosted_client.install_hosted_plugin(url, tmp_path, allow_insecure=True)
    state["discovery"] = {"bsb": 1, "plugins": [
        {"id": "service-demo", "language": "nodejs", "version": "1.2.3", "schema": schema},
        {"id": "other", "language": "nodejs", "version": "1.2.3", "schema": []},
    ]}
    with pytest.raises(ValueError, match="schema URL or object"):
        hosted_client.install_hosted_plugin(url, tmp_path, "service-demo", allow_insecure=True)
    state["discovery"] = {"bsb": 1, "plugins": [{"id": "_/service-demo", "language": "nodejs", "version": "1.2.3", "schema": schema}]}
    snapshot = hosted_client.install_hosted_plugin(url, tmp_path, "service-demo", allow_insecure=True)
    assert json.loads(snapshot.read_text())["source"]["org"] == "_"
    state["discovery"] = {"bsb": 1, "plugins": [{"id": "service-demo", "language": "nodejs", "version": "1.2.3", "schema": {**schema, "version": "1.2.4"}}]}
    with pytest.raises(ValueError, match="version must match"):
        hosted_client.install_hosted_plugin(url, tmp_path, allow_insecure=True)
    document = {"anyvaliVersion": "1.0", "schemaVersion": "1.1", "root": {"kind": "string"}, "definitions": {}, "extensions": {}}
    for name, event in {
        "input": {"type": "fire-and-forget", "category": "emitEvents", "inputSchema": {}, "outputSchema": None},
        "output": {"type": "returnable", "category": "emitReturnableEvents", "inputSchema": document, "outputSchema": {}},
    }.items():
        state["discovery"] = {"bsb": 1, "plugins": [{"id": "service-demo", "language": "nodejs", "version": "1.2.3", "schema": {"pluginId": "service-demo", "events": {name: event}}}]}
        project = tmp_path / name
        with pytest.raises(Exception):
            hosted_client.install_hosted_plugin(url, project, allow_insecure=True)
        assert not (project / ".bsb").exists()
    state["discovery"] = {"bsb": 1, "plugins": [{"id": "service-demo", "language": "nodejs", "version": "1.2.3", "schema": "https://other.example/schema"}]}
    with pytest.raises(ValueError, match="same origin"):
        hosted_client.install_hosted_plugin(url, tmp_path, allow_insecure=True)
    with pytest.raises(ValueError, match="origin without a path"):
        hosted_client.install_hosted_plugin(url + "/api", tmp_path, allow_insecure=True)
    state["redirect"] = True
    with pytest.raises(HTTPError):
        hosted_client.install_hosted_plugin(url, tmp_path, allow_insecure=True)
