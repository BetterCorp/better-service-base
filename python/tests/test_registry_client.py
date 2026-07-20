from __future__ import annotations

import bsb.registry_client as registry_client


class _Response:
    def __enter__(self) -> '_Response':
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return b'{}'


def test_optional_read_sends_configured_registry_token(monkeypatch) -> None:
    authorization: list[str | None] = []

    def fake_urlopen(request):
        authorization.append(request.get_header('Authorization'))
        return _Response()

    monkeypatch.setattr(registry_client, 'REGISTRY_TOKEN', 'private-read-token')
    monkeypatch.setattr(registry_client, 'urlopen', fake_urlopen)

    registry_client.registry_request('GET', '/plugins')

    assert authorization == ['Bearer private-read-token']
