import asyncio
import importlib.util
import json
import subprocess
import sys

import pytest

from bsb.base import BSBService, BSBValidationError, PluginCtor, dispose_all
from bsb.client_generator import generate_client_code
from bsb.config_common import JsonConfig
from bsb.events_controller import SBEvents
from bsb.observable import ObservableBackend, SBObservable
from bsb.plugin_loader import SBPlugins
from bsb.schema import av, object_schema
from bsb.schema_events import create_returnable_event, export_event_schemas


def test_exporter_capabilities_match_supported_signals():
    from bsb.schema_export import build_capabilities
    from bsb.plugins.observable_zipkin import Plugin as Zipkin
    from bsb.plugins.observable_syslog import Plugin as Syslog
    from bsb.plugins.observable_opentelemetry import Plugin as Otlp

    for plugin, supported in ((Zipkin, {"tracing"}), (Syslog, {"logging"}),
                              (Otlp, {"logging", "metrics", "tracing"}), (object, set())):
        capabilities = build_capabilities("observable", plugin)
        for category, methods in capabilities.items():
            assert all(value == (category in supported) for value in methods.values())


def test_native_contracts_traces_and_streams(tmp_path):
    async def check():
        sink = SBObservable("test", "development")
        backend = ObservableBackend("development", "test", "worker", sink)
        loader = SBPlugins(str(tmp_path), False)
        bus = SBEvents("test", "development", str(tmp_path), loader, backend)
        config = JsonConfig(PluginCtor("test", "development", "config", str(tmp_path), "", "", {}, "1.0.0", backend))
        config.load({"services": {"mapped": {"plugin": "service-demo", "language": "nodejs", "enabled": False}}})
        await bus.init(config)
        bus.set_services(await config.get_service_references())
        schema = {"onReturnableEvents": {"fetch": create_returnable_event(
            object_schema({"count": av.int32(), "label": av.optional(av.nullable(av.string()))}),
            object_schema({"answer": av.int32(), "pair": av.tuple_([av.int32(), av.string()])}))}}
        class Worker(BSBService):
            EventSchemas = schema
        worker = Worker(PluginCtor("test", "development", "mapped", str(tmp_path), "", "", {}, "1.0.0", backend, bus))
        traces = []
        async def fetch(trace, value):
            traces.append(trace.trace_id)
            return {"answer": value["count"], "pair": [1, "native"]}
        await worker.events.on_returnable_event("fetch", fetch)
        document = export_event_schemas("service-demo", "1.0.0", schema)
        path = tmp_path / "generated.py"
        path.write_text(generate_client_code(document, "service-demo"), encoding="utf-8")
        spec = importlib.util.spec_from_file_location("native_client_fixture", path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        try:
            client = module.DemoClient(worker)
            root = worker.create_trace("request")
            result = await client.fetch({"count": 2}, obs=root)
            assert result == {"answer": 2, "pair": (1, "native")}
            assert traces == [root.trace_id]
            with pytest.raises(BSBValidationError):
                await client.fetch({"count": "invalid"}, obs=root)
            assert len(traces) == 1
            assert worker.create_trace("other").trace_id != root.trace_id
            calls = []
            async def first(*_): calls.append("one")
            async def second(*_): calls.append("two")
            await bus.on_event("mapped", "round-robin", first)
            await bus.on_event("mapped", "round-robin", second)
            await bus.emit_event("mapped", "round-robin", {})
            await bus.emit_event("mapped", "round-robin", {})
            assert calls == ["one", "two"]
            received = []
            async def receive(trace, error, stream):
                assert error is None
                received.append(await stream.read())
            stream_id = await worker.events.receive_stream("bytes", receive, timeout_seconds=2)
            payload = b"chunk" * 200000
            await worker.events.send_stream("bytes", stream_id, payload, obs=root)
            assert received == [payload]
            with pytest.raises(ValueError):
                await worker.events.send_stream("bytes", stream_id, b"reused")
            root.end()
        finally:
            sys.modules.pop(spec.name, None)
            await bus.dispose()
    asyncio.run(check())


def test_generated_client_static_types(tmp_path):
    schema = export_event_schemas("service-demo", "1.0.0", {"onReturnableEvents": {"fetch": create_returnable_event(
        object_schema({"count": av.int32(), "optional": av.optional(av.string())}), av.int32())}})
    (tmp_path / "generated.py").write_text(generate_client_code(schema, "service-demo"), encoding="utf-8")
    caller = tmp_path / "caller.py"
    caller.write_text("from generated import DemoClient\nasync def call(client: DemoClient) -> int:\n    return await client.fetch({'count': 1})\n")
    command = [sys.executable, "-m", "mypy", "--follow-imports=silent", "--cache-dir", str(tmp_path / "cache"), "caller.py", "generated.py"]
    good = subprocess.run(command, cwd=tmp_path, capture_output=True, text=True)
    assert good.returncode == 0, good.stdout + good.stderr
    caller.write_text(caller.read_text().replace("'count': 1", "'count': 'invalid'"))
    bad = subprocess.run(command, cwd=tmp_path, capture_output=True, text=True)
    assert bad.returncode != 0 and "typeddict-item" in bad.stdout, bad.stdout + bad.stderr


def test_profiles_filters_and_cleanup(tmp_path):
    backend = ObservableBackend("development", "test", "config", SBObservable("test", "development"))
    config = JsonConfig(PluginCtor("test", "development", "config", str(tmp_path), "", "", {}, "1.0.0", backend))
    config.load({"default": {"services": {"worker": {"config": {"a": 1}}}}, "production": {"services": {"worker": {"config": {"b": 2}}}}}, "production")
    assert asyncio.run(config.get_plugin_config(None, "service", "worker")) == {"a": 1, "b": 2}
    with pytest.raises(Exception, match="does not target Python"):
        config.load({"services": {"worker": {"language": "csharp"}}})
    assert SBEvents.matches({"emitEvent": ["mapped"]}, "emitEvent", "mapped")
    assert not SBEvents.matches({"emitEvent": ["mapped"]}, "emitEvent", "other")
    assert SBEvents.matches({"emitEvent": {"enabled": True, "plugins": ["mapped"]}}, "emitEvent", "mapped")
    calls = []
    class Good:
        async def dispose(self): calls.append("good")
    class Bad:
        async def dispose(self):
            calls.append("bad")
            raise RuntimeError("fixture")
    with pytest.raises(ExceptionGroup):
        asyncio.run(dispose_all([Bad(), Good()]))
    assert calls == ["bad", "good"]
