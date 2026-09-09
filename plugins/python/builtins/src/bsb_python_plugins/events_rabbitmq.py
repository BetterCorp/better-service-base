"""Native AMQP transport, compatible with the BSB 9 Node queues and envelopes."""
import asyncio
from collections import OrderedDict
from datetime import datetime, timezone
import hashlib
import json
import math
import socket
import uuid

import aio_pika
from yarl import URL

from bsb.base import BSBEvents
from bsb.schema import av, object_schema
from bsb.streams import ByteStream, chunks


class Config:
    metadata = {"name": "events-rabbitmq", "description": "Durable RabbitMQ events, RPC and streams", "category": "events"}
    validation_schema = object_schema({
        "platformKey": av.nullable(av.string()).default(None),
        "fatalOnDisconnect": av.bool_().default(True),
        "prefetch": av.int32().min(1).max(65535).default(10),
        "endpoints": av.array(av.string().min_length(1)).min_items(1).default(["amqp://localhost"]),
        "credentials": object_schema({"username": av.string().default("guest"), "password": av.string().default("guest").describe("RabbitMQ password", sensitive=True)}).default({"username": "guest", "password": "guest"}),
        "uniqueId": av.nullable(av.string()).default(socket.gethostname()),
    })


class Plugin(BSBEvents):
    def __init__(self, ctor):
        super().__init__(ctor)
        self.config = Config.validation_schema.parse(self.config or {})
        if self.config["uniqueId"] is not None and "||" in self.config["uniqueId"]:
            raise ValueError("RabbitMQ uniqueId cannot contain ||")
        self.my_id = f"{self.config['uniqueId'] or socket.gethostname()}-{uuid.uuid4()}"
        self._closed = False
        self._connections, self._channels = [], []
        self._pending, self._receivers, self._senders = {}, {}, {}
        self._tasks = set()
        self.failure = None

    def platform(self, name):
        key = self.config["platformKey"]
        return name if key is None else f"{name}-{key}"

    def queue(self, kind, *parts):
        name = "-".join([self.platform(kind), *parts])
        if "\0" in name or len(name.encode()) > 255:
            raise ValueError("AMQP queue name exceeds 255 bytes or contains NUL")
        return name

    async def connect(self, label):
        urls = [URL(value) for value in self.config["endpoints"]]
        if any(url.scheme not in ("amqp", "amqps") or not url.host or url.path != urls[0].path for url in urls):
            raise ValueError("RabbitMQ endpoints must use amqp/amqps and the same virtual host")
        connection_type = aio_pika.Connection if self.config["fatalOnDisconnect"] else aio_pika.RobustConnection
        for index, url in enumerate(urls):
            credentials = self.config["credentials"]
            url = url.with_user(credentials["username"]).with_password(credentials["password"])
            url = url.update_query(heartbeat=30, name=f"BSB {self.my_id} {label}")
            connection = connection_type(url)
            try:
                async with asyncio.timeout(15):
                    await connection.connect(timeout=15)
                return connection
            except (OSError, aio_pika.exceptions.AMQPException, TimeoutError):
                await asyncio.gather(connection.close(), return_exceptions=True)
                if index == len(urls) - 1:
                    raise
            except BaseException:
                await asyncio.gather(connection.close(), return_exceptions=True)
                raise

    async def init(self, trace):
        self.failure = asyncio.get_running_loop().create_future()
        # The host awaits this future; retrieving its exception also avoids warnings during startup cleanup.
        self.failure.add_done_callback(lambda future: None if future.cancelled() else future.exception())
        for label in ("publish", "receive"):
            connection = await self.connect(label)
            self._connections.append(connection)
            connection.close_callbacks.add(self.connection_closed)
        self.publisher = await self._connections[0].channel(publisher_confirms=True, on_return_raises=True)
        self.deadletter = self.platform("better.service9.deadletter")
        exchange = await self.publisher.declare_exchange(self.deadletter, "topic", durable=True)
        queue = await self.publisher.declare_queue(self.deadletter, durable=True, arguments={"x-message-ttl": 604800000})
        await queue.bind(exchange, "#")
        self.broadcast = await self.publisher.declare_exchange(self.platform("better.service9.broadcast.direct"), "direct")
        await self.consume(self.queue("91kr", self.my_id), 60000, True, self.reply)
        await self.consume(self.queue("91se", self.my_id), 60000, True, self.stream_control, ordered=True)
        await self.consume(self.queue("91sd", self.my_id), 60000, True, self.stream_data, ordered=True)
        trace.info("RabbitMQ connected; queues and reply consumer ready")

    def connection_closed(self, sender, error):
        if not self._closed and self.config["fatalOnDisconnect"] and not self.failure.done():
            self.failure.set_exception(ConnectionError("RabbitMQ connection closed"))

    async def declare(self, channel, name, ttl, exclusive, *, recover=True):
        options = {"robust": recover} if isinstance(channel, aio_pika.RobustChannel) else {}
        return await channel.declare_queue(name, durable=not exclusive, exclusive=exclusive, auto_delete=exclusive,
            arguments={"x-message-ttl": ttl, "x-expires": ttl, "x-dead-letter-exchange": self.deadletter}, **options)

    async def consume(self, name, ttl, exclusive, handler, routing_key=None, ordered=False):
        channel = await self._connections[1].channel(publisher_confirms=False)
        self._channels.append(channel)
        await channel.set_qos(prefetch_count=1 if ordered else self.config["prefetch"])
        queue = await self.declare(channel, name, ttl, exclusive)
        if routing_key is not None:
            await queue.bind(self.broadcast.name, routing_key)
        failures = OrderedDict()
        async def delivered(message):
            task = asyncio.current_task()
            self._tasks.add(task)
            key = message.message_id or hashlib.sha256(message.body).hexdigest()
            try:
                if len(message.body) > 16 * 1024 * 1024:
                    raise ValueError("AMQP payload exceeds 16 MiB")
                body = json.loads(message.body)
                if not isinstance(body, dict):
                    raise ValueError("AMQP body must be an object")
                await handler(message, body)
                await message.ack()  # RPC handler only returns after the reply is confirmed.
                failures.pop(key, None)
            except asyncio.CancelledError:
                raise  # Connection closure requeues unacknowledged messages.
            except Exception as error:
                attempt = failures.pop(key, 0) + 1
                if attempt < 10:
                    failures[key] = attempt
                    if len(failures) > 10000:
                        failures.popitem(last=False)
                trace = self._obs.create_trace("delivery.failed")
                trace.error(error, {"queue": name, "attempt": attempt})
                trace.end()
                try:
                    await message.nack(requeue=attempt < 10)
                except (aio_pika.exceptions.AMQPException, ConnectionError, RuntimeError):
                    failures.pop(key, None)
            finally:
                self._tasks.discard(task)
        await queue.consume(delivered)

    async def publish(self, queue, body, ttl, correlation=None, *, declare_ttl=None, broadcast=False):
        if self._closed:
            raise RuntimeError("RabbitMQ transport is closed")
        payload = json.dumps(body, allow_nan=False, separators=(",", ":")).encode()
        if len(payload) > 16 * 1024 * 1024:
            raise ValueError("AMQP payload exceeds 16 MiB")
        async with asyncio.timeout(5):
            if declare_ttl is not None:
                # Producers declare too: messages must survive a missing or crashed listener.
                await self.declare(self.publisher, queue, declare_ttl, False, recover=False)
            exchange = self.broadcast if broadcast else self.publisher.default_exchange
            await exchange.publish(aio_pika.Message(payload, delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                content_type="application/json", message_id=str(uuid.uuid4()), app_id=self.my_id, correlation_id=correlation,
                expiration=ttl / 1000, timestamp=datetime.now(timezone.utc)), routing_key=queue, mandatory=not broadcast, timeout=5)

    def incoming(self, body, plugin, event):
        args = body.get("args", [])
        if not isinstance(args, list) or len(args) > 1:
            raise ValueError("Typed BSB events accept one payload")
        trace = self._obs.for_plugin(plugin).create_trace("events.receive", parent=body.get("trace"), attributes={"event": event})
        return trace, args[0] if args else None

    async def reply(self, message, body):
        correlation = message.correlation_id or ""
        reject = correlation.endswith("-reject")
        suffix = "-reject" if reject else "-resolve"
        if not correlation.endswith(suffix):
            raise ValueError("Invalid RPC reply correlation")
        pending = self._pending.get(correlation[:-len(suffix)])
        if pending is not None and not pending.done():
            if reject:
                pending.set_exception(RuntimeError(str(body.get("error", "Remote handler failed"))))
            else:
                pending.set_result(body.get("result"))

    async def on_event(self, trace, plugin, event, listener):
        await self.listen(plugin, event, listener, False)

    async def on_broadcast(self, trace, plugin, event, listener):
        await self.listen(plugin, event, listener, True)

    async def listen(self, plugin, event, listener, broadcast):
        route = self.queue("91eb" if broadcast else "91eq", plugin, event)
        async def handle(message, body):
            trace, data = self.incoming(body, plugin, event)
            try:
                await listener(trace, data)
            except Exception as error:
                trace.error(error)
                raise
            finally:
                trace.end()
        name = self.queue("91eb", plugin, event, str(uuid.uuid4())) if broadcast else route
        await self.consume(name, 3600000, broadcast, handle, route if broadcast else None)

    async def emit_event(self, trace, plugin, event, payload):
        await self.publish(self.queue("91eq", plugin, event), {"trace": trace.to_wire(), "args": [payload]}, 3600000, declare_ttl=3600000)

    async def emit_broadcast(self, trace, plugin, event, payload):
        await self.publish(self.queue("91eb", plugin, event), {"trace": trace.to_wire(), "args": [payload]}, 3600000, broadcast=True)

    async def on_returnable_event(self, trace, plugin, event, listener):
        async def handle(message, body):
            if not message.app_id or not message.correlation_id:
                raise ValueError("RPC requires app_id and correlation_id")
            span, data = self.incoming(body, plugin, event)
            try:
                try:
                    reply, outcome = {"trace": span.to_wire(), "result": await listener(span, data)}, "resolve"
                except Exception as error:
                    span.error(error)
                    reply, outcome = {"trace": span.to_wire(), "error": str(error)}, "reject"
                await self.publish(self.queue("91kr", message.app_id), reply, 5000, message.correlation_id + "-" + outcome)
            finally:
                span.end()
        await self.consume(self.queue("91ar", plugin, event), 60000, False, handle)

    async def emit_event_and_return(self, trace, plugin, event, timeout_seconds, payload):
        if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
            raise ValueError("RPC timeout must be positive and finite")
        correlation = str(uuid.uuid4())
        pending = self._pending[correlation] = asyncio.get_running_loop().create_future()
        try:
            async with asyncio.timeout(timeout_seconds):
                await self.publish(self.queue("91ar", plugin, event), {"trace": trace.to_wire(), "args": [payload]},
                    int(timeout_seconds * 1000 + 5000), correlation, declare_ttl=60000)
                return await pending
        finally:
            self._pending.pop(correlation, None)
            if not pending.done():
                pending.cancel()

    async def control(self, peer, correlation, body):
        await self.publish(self.queue("91se", peer), body, 60000, correlation)

    async def stream_control(self, message, body):
        correlation = message.correlation_id or ""
        if correlation.startswith("s-") and correlation[2:] in self._senders:
            peer, controls = self._senders[correlation[2:]]
            if peer != message.app_id:
                raise ValueError("Unexpected stream control sender")
            controls.put_nowait(body)
        elif correlation.startswith("r-") and correlation[2:] in self._receivers:
            receiver = self._receivers[correlation[2:]]
            if body.get("type") == "start":
                if not message.app_id or message.app_id != body.get("myId"):
                    raise ValueError("Invalid stream sender")
                if receiver["peer"] is not None and receiver["peer"] != message.app_id:
                    raise ValueError("Stream sender changed")
                receiver["peer"] = message.app_id
                if not receiver["start"].done():
                    receiver["start"].set_result(body)
            elif body.get("type") == "timeout" and message.app_id == receiver["peer"]:
                receiver["stream"].abort(TimeoutError("Remote stream timed out"))
                receiver["task"].cancel()
            else:
                raise ValueError("Invalid stream control")

    async def stream_data(self, message, body):
        stream_id = message.correlation_id or ""
        receiver = self._receivers.get(stream_id)
        if receiver is None:
            return
        if not receiver["peer"] or receiver["peer"] != message.app_id:
            raise ValueError("Unexpected stream sender")
        stream = receiver["stream"]
        if body.get("type") == "data":
            value = body.get("data")
            if isinstance(value, dict) and value.get("type") == "Buffer":
                value = value.get("data")
            if isinstance(value, list) and len(value) <= 1048576 and all(type(x) is int and 0 <= x <= 255 for x in value):
                data = bytes(value)
            elif isinstance(value, str) and len(value.encode()) <= 1048576:
                data = value.encode()
            else:
                raise ValueError("Invalid stream byte buffer or chunk exceeds 1 MiB")
            await stream.feed(data)
        elif body.get("type") == "event" and body.get("event") == "end":
            await stream.feed(None)
        elif body.get("type") == "event" and body.get("event") == "error":
            stream.abort(RuntimeError("Remote stream failed"))
        else:
            raise ValueError("Invalid stream data")
        await self.control(receiver["peer"], "s-" + stream_id, {"type": "receipt", "timeout": stream.timeout_seconds * 1000})

    async def receive_stream(self, trace, plugin, event, handler, timeout_seconds=5):
        if self._closed or not math.isfinite(timeout_seconds) or not 0 < timeout_seconds <= 86400 or int(timeout_seconds) != timeout_seconds:
            raise ValueError("Invalid stream timeout or closed transport")
        stream_id = str(uuid.uuid4())
        receiver = {"peer": None, "start": asyncio.get_running_loop().create_future()}
        async def request():
            await self.control(receiver["peer"], "s-" + stream_id, {"type": "read", "trace": trace.to_wire()})
        stream = receiver["stream"] = ByteStream(timeout_seconds, request)
        async def receive():
            called, span = False, None
            try:
                start = await asyncio.wait_for(receiver["start"], 30)
                span = self._obs.for_plugin(plugin).create_trace("stream.receive", parent=start.get("trace"))
                await self.control(receiver["peer"], "s-" + stream_id, {"type": "receipt", "timeout": timeout_seconds * 1000, "trace": span.to_wire()})
                called = True
                await handler(span, None, stream)
                if not stream.ended:
                    raise RuntimeError("Receiver must consume the stream through EOF")
                await self.control(receiver["peer"], "s-" + stream_id, {"type": "event", "event": "end", "trace": span.to_wire()})
            except (Exception, asyncio.CancelledError) as error:
                stream.abort(RuntimeError(str(error)))
                if not called:
                    await handler(span or trace, error, None)
                elif not isinstance(error, asyncio.CancelledError):
                    (span or trace).error(error)
                if receiver["peer"] and not self._closed:
                    try:
                        await self.control(receiver["peer"], "s-" + stream_id, {"type": "timeout"})
                    except Exception:
                        pass
            finally:
                self._receivers.pop(stream_id, None)
                if span:
                    span.end()
        self._receivers[stream_id] = receiver
        task = receiver["task"] = asyncio.create_task(receive())
        self._tasks.add(task)
        task.add_done_callback(self.task_done)
        return f"{self.my_id}||{stream_id}||{timeout_seconds:g}"

    def task_done(self, task):
        self._tasks.discard(task)
        if not task.cancelled() and task.exception():
            trace = self._obs.create_trace("stream.failed")
            trace.error(task.exception())
            trace.end()

    async def send_stream(self, trace, plugin, event, stream_id, source):
        parts = stream_id.split("||")
        if len(parts) != 3 or not parts[0] or not parts[1]:
            raise ValueError("Invalid stream ID")
        peer, stream_id, value = parts
        seconds = float(value)
        if not math.isfinite(seconds) or not 0 < seconds <= 86400 or stream_id in self._senders:
            raise ValueError("Invalid timeout or stream already being sent")
        controls = asyncio.Queue(128)
        self._senders[stream_id] = peer, controls
        data = chunks(source)
        ended = False
        try:
            await self.control(peer, "r-" + stream_id, {"type": "start", "myId": self.my_id, "trace": trace.to_wire()})
            wait = 30
            while True:
                message = await asyncio.wait_for(controls.get(), wait)
                wait = seconds
                kind = message.get("type")
                if kind == "receipt":
                    continue
                if kind == "event" and message.get("event") == "end" and ended:
                    return
                if kind != "read":
                    raise RuntimeError("Stream receiver failed or closed before completion")
                if ended:
                    continue
                async with asyncio.timeout(seconds):
                    try:
                        part = await anext(data)
                        body = {"type": "data", "data": {"type": "Buffer", "data": list(part)}, "trace": trace.to_wire()}
                    except StopAsyncIteration:
                        ended = True
                        body = {"type": "event", "event": "end", "data": None, "trace": trace.to_wire()}
                    await self.publish(self.queue("91sd", peer), body, 60000, stream_id)
        except BaseException:
            if not self._closed:
                try:
                    await self.control(peer, "r-" + stream_id, {"type": "timeout"})
                except Exception:
                    pass
            raise
        finally:
            self._senders.pop(stream_id, None)
            await data.aclose()

    async def dispose(self):
        if self._closed:
            return
        self._closed = True
        for pending in self._pending.values():
            if not pending.done():
                pending.set_exception(ConnectionError("RabbitMQ transport closed"))
        for _, controls in self._senders.values():
            while not controls.empty():
                controls.get_nowait()
            controls.put_nowait({"type": "timeout"})
        tasks = list(self._tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        errors = []
        for connection in reversed(self._connections):
            try:
                await asyncio.wait_for(connection.close(), 5)
            except Exception as error:
                errors.append(error)
        if self.failure is not None and not self.failure.done():
            self.failure.cancel()
        if errors:
            raise ExceptionGroup("RabbitMQ shutdown failed", errors)
