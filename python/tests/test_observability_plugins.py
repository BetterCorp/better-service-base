import asyncio
from datetime import datetime, timedelta, timezone
import gzip
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib
import ipaddress
import json
from pathlib import Path
import socket
import ssl
from threading import Thread

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from bsb.base import PluginCtor
from bsb.observable import ObservableBackend, SBObservable
from bsb_python_plugins.observable_graylog import datagrams
from bsb_python_plugins.observable_pino import Config as PinoConfig, Plugin as Pino
from bsb.telemetry import post


def test_native_logging_and_remote_exports(tmp_path):
    requests, state = [], {"status": 200, "reply": {}}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass
        def do_POST(self):
            requests.append((self.path, json.loads(self.rfile.read(int(self.headers["Content-Length"]))), dict(self.headers)))
            self.send_response(state["status"])
            self.end_headers()
            self.wfile.write(json.dumps(state["reply"]).encode())
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}"
    sink = SBObservable("test", "test")
    backend = ObservableBackend("test", "test", "worker", sink)
    trace = backend.create_trace("request")
    entry = {"timestamp": datetime.now(timezone.utc).isoformat(), "level": "info", "plugin": "worker", "message": "hello",
        "traceId": trace.trace_id, "spanId": trace.span_id, "meta": {"users": [{"token": "secret", "name": "one"}]}}
    def create(name, config):
        module = importlib.import_module("bsb_python_plugins.observable_" + name)
        return module.Plugin(PluginCtor("test", "test", name, str(tmp_path), "", "", module.Config.validation_schema.parse(config), "1.0.0", backend))
    async def check():
        file = create("logging_file", {"path": "app.log", "maxBytes": 400, "maxFiles": 2, "compress": True, "redact": ["meta.users.*.token"]})
        await file.init(trace)
        for _ in range(5): file.emit_log(entry)
        file.dispose()
        assert len(list(tmp_path.glob("app.log.*.gz"))) == 2
        assert "secret" not in (tmp_path / "app.log").read_text()
        assert entry["meta"]["users"][0]["token"] == "secret"
        with gzip.open(tmp_path / "app.log.1.gz", "rt") as archive:
            assert "[REDACTED]" in archive.read()
        plugins = [create("opentelemetry", {"endpoint": url, "redact": ["meta.users.*.token"]}),
            create("axiom", {"endpoint": url, "token": "axiom-token", "dataset": "test", "allowInsecureHttp": True}),
            create("zipkin", {"endpoint": url + "/api/v2/spans"})]
        sink.plugins = plugins
        for plugin in plugins: await plugin.init(trace)
        backend.info(trace, "hello {users}", entry["meta"])
        backend.create_counter("requests").increment(1, {"route": "/"})
        backend.create_counter("requests").increment(2, {"route": "/"})
        backend.for_plugin("other").create_counter("requests").increment(8)
        backend.create_histogram("latency").record(3)
        trace.end()
        for plugin in plugins: await plugin.dispose()
        sink.plugins = []
        metrics = next(body for path, body, _ in requests if path == "/v1/metrics")
        scopes = metrics["resourceMetrics"][0]["scopeMetrics"]
        assert len(scopes) == 2
        counter = next(metric for metric in scopes[0]["metrics"] if metric["name"] == "requests")
        assert counter["sum"]["isMonotonic"] and counter["sum"]["dataPoints"][0]["asDouble"] == 3
        logs = next(body for path, body, _ in requests if path == "/v1/logs")
        assert "secret" not in json.dumps(logs)
        assert "[REDACTED]" in logs["resourceLogs"][0]["scopeLogs"][0]["logRecords"][0]["body"]["stringValue"]
        assert next(body for path, body, _ in requests if path == "/api/v2/spans")[0]["traceId"] == trace.trace_id
        assert any(path == "/v1/datasets/test/ingest" and headers["Authorization"] == "Bearer axiom-token" for path, _, headers in requests)
        udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        udp.bind(("127.0.0.1", 0))
        udp.setblocking(False)
        syslog = create("syslog", {"host": "127.0.0.1", "port": udp.getsockname()[1], "redact": ["meta.users.*.token"]})
        syslog.emit_log(entry)
        await syslog.dispose()
        message = await asyncio.wait_for(asyncio.get_running_loop().sock_recv(udp, 65535), 2)
        udp.close()
        assert message.startswith(b"<134>1 ") and b"secret" not in message
        chunks = datagrams({"message": "a" * 5000}, False)
        assert len(chunks) > 1 and chunks[0][:2] == b"\x1e\x0f"
        assert json.loads(b"".join(chunk[12:] for chunk in chunks))["message"] == "a" * 5000
        assert json.loads(gzip.decompress(datagrams({"message": "zip"}, True)[0])) == {"message": "zip"}
        # Real TLS handshake with a private CA keeps certificate and hostname verification enabled.
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "BSB test")])
        now = datetime.now(timezone.utc)
        certificate = (x509.CertificateBuilder().subject_name(subject).issuer_name(subject).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - timedelta(minutes=1)).not_valid_after(now + timedelta(days=1))
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .add_extension(x509.SubjectAlternativeName([x509.DNSName("localhost")]), critical=False).sign(key, hashes.SHA256()))
        cert_path, key_path = tmp_path / "ca.pem", tmp_path / "key.pem"
        cert_path.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
        key_path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert_path, key_path)
        received = asyncio.get_running_loop().create_future()
        async def accept(reader, writer):
            try:
                size = int(await reader.readuntil(b" "))
                received.set_result(await reader.readexactly(size))
            finally:
                writer.close()
                await writer.wait_closed()
        listener = await asyncio.start_server(accept, "127.0.0.1", 0, ssl=context)
        port = listener.sockets[0].getsockname()[1]
        tls = create("syslog", {"host": "localhost", "port": port, "protocol": "tls", "caCertificatePath": str(cert_path)})
        try:
            await tls.export([entry])
            assert (await asyncio.wait_for(received, 2)).startswith(b"<134>1 ")
            for config in ({"host": "127.0.0.1", "caCertificatePath": str(cert_path)}, {"host": "localhost"}):
                bad = create("syslog", {"port": port, "protocol": "tls", **config})
                with pytest.raises(ssl.SSLCertVerificationError):
                    await bad.export([entry])
                await bad.dispose()
        finally:
            await tls.dispose()
            listener.close()
            await listener.wait_closed()
    try:
        asyncio.run(check())
        count = len(requests)
        state["status"] = 401
        with pytest.raises(Exception): post(url, {}, {})
        assert len(requests) == count + 1
        state["status"], state["reply"] = 200, {"partialSuccess": {"rejectedSpans": "1"}}
        with pytest.raises(ValueError, match="partial"):
            post(url, {}, {})
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_log_redaction_is_per_exporter_and_preserves_raw_sinks(tmp_path, capsys):
    sink = SBObservable("test", "test")
    backend = ObservableBackend("test", "test", "worker", sink)
    trace = backend.create_trace("request")
    pino = Pino(PluginCtor("test", "test", "pino", str(tmp_path), "", "",
        PinoConfig.validation_schema.parse({"redact": ["meta"]}), "1.0.0", backend))

    class Custom:
        def emit_log(self, entry):
            self.entry = entry

    custom = Custom()
    sink.plugins = [pino, custom]
    backend.info(trace, "login {token}", {"token": "secret"})
    output = json.loads(capsys.readouterr().out)
    assert output["msg"] == "login [REDACTED]" and output["meta"] == "[REDACTED]"
    assert custom.entry["message"] == "login secret"
    assert custom.entry["meta"] == {"token": "secret"}
    fallback = []
    sink.plugins = []
    sink.logger = type("Logger", (), {"log": lambda _, level, message: fallback.append((level, message))})()
    backend.info(trace, "login {token}", {"token": "secret"})
    assert fallback == [(20, "login secret")]
