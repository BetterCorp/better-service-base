import asyncio
from copy import deepcopy
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import pytest
from cryptography.exceptions import InvalidTag

from bsb.base import PluginCtor
from bsb.observable import ObservableBackend, SBObservable
from bsb.plugins.config_vault import Config, Plugin, RetryableVaultError, apply_overrides
from bsb.plugins.config_vault_google import Plugin as GooglePlugin
import bsb.registry_client as registry


def test_vault_http_cache_and_registry_variants(tmp_path, monkeypatch):
    state = {"status": 200, "requests": [], "variants": ["nodejs", "python"]}
    response = {"language": "python", "version": 1, "profile": "default", "application": "app", "group": "group",
        "config": {"default": {"services": {"worker": {"plugin": "service-worker", "language": "python", "config": {"port": 1}, "envOverridePaths": ["port"]},
            "remote": {"enabled": False, "language": "nodejs", "plugin": "service-other"}}}}}
    schema = {"pluginName": "service-worker", "version": "1.0.0", "events": {}}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass
        def do_GET(self):
            state["requests"].append((self.path, {key.lower(): value for key, value in self.headers.items()}))
            status = state["status"]
            if self.path.endswith("implementations"):
                body = {"implementations": [{"language": language} for language in state["variants"]]}
            elif "/schema?" in self.path:
                body = schema
            elif self.path.startswith("/plugins/"):
                body = {"plugin": {"version": "1.0.0"}}
            else:
                body = response
            self.send_response(status)
            if status == 302:
                self.send_header("Location", "/redirect-should-not-be-followed")
            self.end_headers()
            self.wfile.write(json.dumps(body).encode())
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}"
    backend = ObservableBackend("test", "test", "config", SBObservable("test", "test"))
    settings = Config.validation_schema.parse({"vaultUrl": url, "apiKeyId": "key", "apiSecret": "secret", "allowInsecureHttp": True,
        "BSB_CONFIG_OVERRIDES": '{"services":{"worker":{"port":2}}}'})
    def create(cls=Plugin, **overrides):
        return cls(PluginCtor("test", "test", "config", str(tmp_path), "", "", {**settings, **overrides}, "1.0.0", backend))
    async def check():
        live = create()
        await live.init(backend.create_trace("init"))
        assert (await live.get_plugin_config(None, "service", "worker"))["port"] == 2
        assert "remote" not in await live.get_service_plugins()
        assert "remote" in await live.get_service_references()
        assert state["requests"][-1][1]["x-vault-secret"] == "secret"
        cache = live.cache_file()
        saved = cache.read_bytes()
        assert b'service-worker' not in saved and b'"port"' not in saved
        state["status"] = 503
        stale = create()
        stale.retry_budget = .05
        await stale.init(backend.create_trace("cached"))
        for code in (401, 403, 302, 400):
            state["status"] = code
            with pytest.raises(RuntimeError, match=f"HTTP {code}"):
                await create().init(backend.create_trace("refused"))
        assert all("redirect-should" not in path for path, _ in state["requests"])
        state["status"] = 200
        response["language"] = "nodejs"
        with pytest.raises(ValueError, match="language"):
            await create().init(backend.create_trace("wrong-language"))
        assert cache.read_bytes() == saved
        response["language"] = "python"
        state["status"] = 503
        tampered = json.loads(saved)
        tampered["tag"] = "AAAAAAAAAAAAAAAAAAAAAA=="
        cache.write_text(json.dumps(tampered))
        broken = create()
        broken.retry_budget = .05
        with pytest.raises(InvalidTag):
            await broken.init(backend.create_trace("tampered"))
        cache.write_bytes(saved)
        changed = create(apiSecret="different")
        changed.retry_budget = .05
        with pytest.raises(InvalidTag):
            await changed.init(backend.create_trace("changed-key"))
        disabled = create(staleAllowedHours=0)
        disabled.retry_budget = .05
        with pytest.raises(RetryableVaultError):
            await disabled.init(backend.create_trace("no-cache"))
    try:
        asyncio.run(check())
        with pytest.raises(ValueError, match="not permitted"):
            apply_overrides(deepcopy(response["config"]), "default", '{"services":{"worker":{"unlisted":1}}}')
        with pytest.raises(ValueError, match="Forbidden"):
            apply_overrides(deepcopy(response["config"]), "default", '{"constructor":{}}')
        state["status"] = 200
        monkeypatch.setattr(registry, "REGISTRY_URL", url)
        monkeypatch.setattr(registry, "REGISTRY_TOKEN", "registry-key")
        monkeypatch.setenv("BSB_REGISTRY_ALLOW_INSECURE_HTTP", "true")
        with pytest.raises(ValueError, match="source-language"):
            registry.install_plugin("org/service-worker", tmp_path)
        path = registry.install_plugin("org/service-worker", tmp_path, "nodejs", "1.0.0")
        assert path.name == "org~service-worker~nodejs.json"
        document = json.loads(path.read_text())
        assert document["pluginId"] == "service-worker"
        assert document["source"]["language"] == "nodejs"
        assert (tmp_path / "bsb_clients" / "org_service_worker_nodejs.py").is_file()
        assert state["requests"][-1][1]["authorization"] == "Bearer registry-key"
        state["variants"] = ["python"]
        assert registry.get_plugin_schema("org/service-worker")["source"]["language"] == "python"
        with pytest.raises(ValueError, match="identifier"):
            registry.install_plugin("../escape", tmp_path)
        state["status"] = 302
        with pytest.raises(RuntimeError, match="HTTP 302"):
            registry.get_plugin_schema("org/service-worker", "python", "1.0.0")
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_google_identity_refresh(monkeypatch, tmp_path):
    import bsb.plugins.config_vault_google as google
    calls = []
    class Credentials:
        valid = False
        token = "identity"
        def refresh(self, request):
            calls.append("refresh")
            self.valid = True
    monkeypatch.setattr(google, "fetch_id_token_credentials", lambda audience, request: (calls.append(audience) or Credentials()))
    backend = ObservableBackend("test", "test", "config", SBObservable("test", "test"))
    plugin = GooglePlugin(PluginCtor("test", "test", "config", str(tmp_path), "", "",
        {"apiKeyId": "key", "apiSecret": "secret", "googleAudience": "https://vault.example"}, "1.0.0", backend))
    assert plugin.headers()["X-Serverless-Authorization"] == "Bearer identity"
    assert plugin.headers()["x-vault-secret"] == "secret"
    plugin.headers(refresh=True)
    assert calls == ["https://vault.example", "refresh", "https://vault.example", "refresh"]
