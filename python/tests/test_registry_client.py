from __future__ import annotations

import bsb.registry_client as registry_client
import pytest


def test_scoped_dotted_identifiers_and_traversal():
    assert registry_client.parse_plugin_id('@acme/service.worker') == ('@acme', 'service.worker')
    for value in ('../worker', 'a/b/c', '/worker', 'worker\n'):
        with pytest.raises(ValueError):
            registry_client.parse_plugin_id(value)


def test_failed_install_does_not_poison_existing_snapshots(tmp_path, monkeypatch):
    schema = {"pluginId": "service-demo", "events": {}, "source": {"language": "nodejs"}}
    monkeypatch.setattr(registry_client, "get_plugin_schema", lambda *_: schema)
    first = registry_client.install_plugin("org/service-demo", tmp_path, "nodejs")
    before = first.read_bytes()
    with pytest.raises(ValueError, match="collide"):
        registry_client.install_plugin("org/service_demo", tmp_path, "nodejs")
    assert first.read_bytes() == before
    assert list(first.parent.glob("*.json")) == [first]
    assert registry_client.sync_clients(tmp_path)


def test_registry_errors_retain_bounded_details(monkeypatch):
    from io import BytesIO
    from urllib.error import HTTPError
    import bsb.http as http
    body = b'{"error":"Invalid plugin","code":"VALIDATION","details":[{"path":"version","message":"exact version required"}]}'
    error = HTTPError("https://registry.example/plugins", 400, "Bad request", {}, BytesIO(body))
    class Opener:
        def open(self, *_args, **_kwargs):
            raise error
    monkeypatch.setattr(http, "build_opener", lambda *_: Opener())
    with pytest.raises(RuntimeError, match=r"Invalid plugin \[VALIDATION\].*version: exact version required"):
        registry_client.registry_request("POST", "/plugins")
    assert error.fp.closed

def test_error_body_failure_preserves_authentication_status(monkeypatch):
    from io import BytesIO
    from urllib.error import HTTPError
    import bsb.http as http
    class BrokenBody(BytesIO):
        def read(self, *_):
            raise TimeoutError("body stalled")
    error = HTTPError("https://vault.example/config", 401, "Unauthorized", {}, BrokenBody())
    class Opener:
        def open(self, *_args, **_kwargs):
            raise error
    monkeypatch.setattr(http, "build_opener", lambda *_: Opener())
    with pytest.raises(HTTPError) as caught:
        http.json_request("GET", "https://vault.example/config")
    assert caught.value is error and caught.value.code == 401 and error.fp.closed


class _Response:
    def __enter__(self) -> '_Response':
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return b'{}'


def test_optional_read_sends_configured_registry_token(monkeypatch) -> None:
    authorization: list[str | None] = []

    def fake_request(method, url, **kwargs):
        authorization.append(kwargs['headers'].get('Authorization'))
        return {}

    monkeypatch.setattr(registry_client, 'REGISTRY_TOKEN', 'private-read-token')
    monkeypatch.setattr(registry_client, 'json_request', fake_request)

    registry_client.registry_request('GET', '/plugins')

    assert authorization == ['Bearer private-read-token']
