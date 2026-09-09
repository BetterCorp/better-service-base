import json
from io import BytesIO
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import time
from urllib.error import HTTPError

import pytest

from bsb.http import json_request


def test_json_request_enforces_total_deadline_during_slow_body():
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = json.dumps({"value": "x" * 20}).encode()
            self.send_response(401 if self.path == "/unauthorized" else 200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            for byte in body:
                try:
                    self.wfile.write(bytes([byte]))
                    self.wfile.flush()
                except OSError:
                    break
                time.sleep(.03)

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    started = time.monotonic()
    try:
        with pytest.raises(TimeoutError, match="timed out"):
            json_request("GET", f"http://127.0.0.1:{server.server_port}", timeout=.15)
        assert time.monotonic() - started < .5
        started = time.monotonic()
        with pytest.raises(HTTPError) as caught:
            json_request("GET", f"http://127.0.0.1:{server.server_port}/unauthorized", timeout=.15)
        assert caught.value.code == 401
        assert caught.value.bsb_body == ""
        assert time.monotonic() - started < .5
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_json_request_preserves_normal_body_and_size_limit(monkeypatch):
    import bsb.http as http

    class Response(BytesIO):
        def __enter__(self): return self
        def __exit__(self, *_args): self.close()

    class Opener:
        def __init__(self, body): self.body = body
        def open(self, *_args, **_kwargs): return Response(self.body)

    monkeypatch.setattr(http, "build_opener", lambda *_: Opener(b'{"ok": true}'))
    assert json_request("GET", "https://example.test") == {"ok": True}
    monkeypatch.setattr(http, "build_opener", lambda *_: Opener(b"12345"))
    with pytest.raises(ValueError, match="exceeds size limit"):
        json_request("GET", "https://example.test", limit=4)


def test_https_handler_passes_supported_connection_options(monkeypatch):
    import bsb.http as http

    handler = http._DeadlineHTTPSHandler(http._Deadline(1))
    captured = {}
    monkeypatch.setattr(handler, "do_open", lambda factory, request, **kwargs: captured.update(kwargs))
    handler.https_open(object())
    assert captured == {"context": handler._context}
