from __future__ import annotations

import bsb.registry_client as registry_client
import pytest


def test_scoped_dotted_identifiers_and_traversal():
    assert registry_client.parse_plugin_id('@acme/service.worker') == ('@acme', 'service.worker')
    for value in ('../worker', 'a/b/c', '/worker', 'worker\n'):
        with pytest.raises(ValueError):
            registry_client.parse_plugin_id(value)


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
