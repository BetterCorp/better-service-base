import asyncio
import json
from types import SimpleNamespace

import pytest

from bsb.base import PluginCtor
from bsb.observable import ObservableBackend, SBObservable
import bsb_python_plugins.events_rabbitmq as rabbitmq
from bsb_python_plugins.events_rabbitmq import Plugin


def create_rabbit(tmp_path, config=None):
    backend = ObservableBackend("test", "test", "rabbit", SBObservable("test", "test"))
    return Plugin(PluginCtor("test", "test", "rabbit", str(tmp_path), "", "", config or {}, "1.0.0", backend))


def test_rabbit_rejects_stream_delimiter_in_unique_id(tmp_path):
    with pytest.raises(ValueError, match=r"uniqueId cannot contain \|\|"):
        create_rabbit(tmp_path, {"uniqueId": "host||stream"})


def test_rabbit_validates_completed_broadcast_queue_name(tmp_path, monkeypatch):
    async def check():
        rabbit = create_rabbit(tmp_path)
        consumed = []

        async def consume(name, *_args, **_kwargs):
            consumed.append(name)

        rabbit.consume = consume
        monkeypatch.setattr(rabbitmq.uuid, "uuid4", lambda: "00000000-0000-0000-0000-000000000000")
        plugin = "é" * 105 + "a"
        await rabbit.listen(plugin, "x", lambda *_: None, True)
        assert len(consumed[0].encode()) == 255
        with pytest.raises(ValueError, match="exceeds 255 bytes"):
            await rabbit.listen(plugin + "b", "x", lambda *_: None, True)
        assert len(consumed) == 1

    asyncio.run(check())


@pytest.mark.parametrize("fatal", [True, False])
def test_rabbit_connect_attempts_every_endpoint_with_per_attempt_timeout(tmp_path, monkeypatch, fatal):
    async def check():
        rabbit = create_rabbit(tmp_path, {
            "endpoints": ["amqp://first/v", "amqp://second/v", "amqp://third/v"],
            "fatalOnDisconnect": fatal,
        })
        attempts = []
        deadlines = []
        closed = []
        clock = {"now": 0, "deadline": None}

        class Connection:
            def __init__(self, url, **_kwargs):
                self.host = url.host
                assert url.query["name"] == f"BSB {rabbit.my_id} publish"
            async def connect(self, *, timeout):
                if clock["deadline"] is not None and clock["now"] >= clock["deadline"]:
                    raise TimeoutError
                attempts.append((self.host, timeout))
                if len(attempts) < 3:
                    clock["now"] += timeout
                    raise TimeoutError
            async def close(self):
                closed.append(self.host)

        class AggregateTimeout:
            def __init__(self, seconds):
                self.deadline = clock["now"] + seconds
                self.previous = None
                deadlines.append(seconds)
            async def __aenter__(self):
                self.previous = clock["deadline"]
                clock["deadline"] = self.deadline
            async def __aexit__(self, *_args):
                clock["deadline"] = self.previous

        monkeypatch.setattr(rabbitmq.aio_pika, "Connection", Connection)
        monkeypatch.setattr(rabbitmq.aio_pika, "RobustConnection", Connection)
        monkeypatch.setattr(rabbitmq.asyncio, "timeout", AggregateTimeout)
        connection = await rabbit.connect("publish")
        assert connection.host == "third"
        assert attempts == [("first", 15), ("second", 15), ("third", 15)]
        assert deadlines == [15, 15, 15]
        assert closed == ["first", "second"]

    asyncio.run(check())


def test_rabbit_wire_confirmations_poison_and_streams(tmp_path):
    async def check():
        queues, declarations, published = {}, [], []
        gate = asyncio.Event()
        gate.set()
        class Incoming:
            def __init__(self, body, correlation=None, app_id="node-host", message_id="message"):
                self.body, self.correlation_id, self.app_id, self.message_id = body, correlation, app_id, message_id
                self.acks, self.nacks = 0, []
            async def ack(self): self.acks += 1
            async def nack(self, *, requeue): self.nacks.append(requeue)
        class Exchange:
            name = "exchange"
            async def publish(self, message, routing_key, **kwargs):
                published.append((routing_key, message, kwargs))
                await gate.wait()
                if routing_key in queues:
                    incoming = Incoming(message.body, message.correlation_id, message.app_id, message.message_id)
                    await queues[routing_key](incoming)
        class Queue:
            def __init__(self, name): self.name = name
            async def bind(self, *_): pass
            async def consume(self, callback): queues[self.name] = callback
        class Channel:
            default_exchange = Exchange()
            async def declare_exchange(self, *_args, **_kwargs): return Exchange()
            async def declare_queue(self, name, **kwargs):
                declarations.append((name, kwargs))
                return Queue(name)
            async def set_qos(self, **_): pass
        class Connection:
            close_callbacks = set()
            async def channel(self, **kwargs):
                if kwargs.get("publisher_confirms"):
                    assert kwargs["on_return_raises"] is True
                return Channel()
            async def close(self): pass
        class Transport(Plugin):
            async def connect(self, label): return Connection()
        def create(name):
            backend = ObservableBackend("test", "test", name, SBObservable("test", "test"))
            return Transport(PluginCtor("test", "test", name, str(tmp_path), "", "", {"platformKey": "test"}, "1.0.0", backend))
        first, second = create("first"), create("second")
        trace = first._obs.create_trace("test")
        await first.init(trace)
        await second.init(second._obs.create_trace("init"))
        try:
            await first.emit_event(trace, "service-absent", "event", {"value": 1})
            declaration = next(options for name, options in declarations if name == "91eq-test-service-absent-event")
            assert declaration["durable"] and not declaration["auto_delete"]
            assert declaration["arguments"]["x-message-ttl"] == 3600000
            route, message, options = published[-1]
            assert json.loads(message.body) == {"trace": trace.to_wire(), "args": [{"value": 1}]}
            assert options["mandatory"] and message.delivery_mode.value == 2
            seen = []
            async def handler(span, payload):
                seen.append(span.trace_id)
                return payload["count"] + 1
            await second.on_returnable_event(trace, "worker", "calculate", handler)
            assert await first.emit_event_and_return(trace, "worker", "calculate", 2, {"count": 4}) == 5
            assert seen == [trace.trace_id]
            incoming = Incoming(json.dumps({"trace": trace.to_wire(), "args": [{"count": 2}]}).encode(), "request")
            gate.clear()
            delivery = asyncio.create_task(queues["91ar-test-worker-calculate"](incoming))
            await asyncio.sleep(.01)
            assert incoming.acks == 0
            gate.set()
            await delivery
            assert incoming.acks == 1
            poison = Incoming(b"invalid json", message_id="poison")
            for _ in range(10):
                await queues["91ar-test-worker-calculate"](poison)
            assert poison.acks == 0 and poison.nacks == [True] * 9 + [False]
            data = bytes(range(256)) * 4096
            received = asyncio.get_running_loop().create_future()
            async def receive(span, error, stream):
                assert error is None
                received.set_result(await stream.read())
            stream_id = await second.receive_stream(trace, "worker", "file", receive, 2)
            await first.send_stream(trace, "worker", "file", stream_id, data)
            assert await received == data
            assert not first._senders and not second._receivers
            buffers = [json.loads(message.body) for route, message, _ in published if route.startswith("91sd")]
            assert buffers[0]["data"]["type"] == "Buffer" and len(buffers[0]["data"]["data"]) == 65536
            # A reply publishing failure must requeue the original RPC request.
            original = second.publish
            async def failed(*args, **kwargs): raise ConnectionError("confirm failed")
            second.publish = failed
            retry = Incoming(incoming.body, "retry")
            await queues["91ar-test-worker-calculate"](retry)
            assert retry.acks == 0 and retry.nacks == [True]
            second.publish = original
            second.connection_closed(None, ConnectionError())
            with pytest.raises(ConnectionError):
                await second.failure
        finally:
            await first.dispose()
            await second.dispose()
    asyncio.run(check())
