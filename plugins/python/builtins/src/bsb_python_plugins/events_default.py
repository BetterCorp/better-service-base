from __future__ import annotations

import asyncio
import math
import uuid
from collections import defaultdict
from typing import Any, Awaitable, Callable

from bsb.base import BSBEvents
from bsb.observable import Trace
from bsb.schema import object_schema
from bsb.streams import ByteStream, chunks


class Config:
    metadata = {
        "name": "events-default",
        "description": "Default in-memory events transport.",
        "category": "events",
    }
    validation_schema = object_schema({})


class Plugin(BSBEvents):
    def __init__(self, ctor) -> None:
        super().__init__(ctor)
        self._event_listeners: dict[str, list[Callable[..., Awaitable[None]]]] = defaultdict(list)
        self._broadcast_listeners: dict[str, list[Callable[..., Awaitable[None]]]] = defaultdict(list)
        self._returnable_listeners: dict[str, list[Callable[..., Awaitable[Any]]]] = defaultdict(list)
        self._round_robin = defaultdict(int)
        self._closed = False
        self._tasks = set()
        self._streams = {}

    def _key(self, plugin_name: str, event: str) -> tuple[str, str]:
        if self._closed:
            raise RuntimeError("Events transport is closed")
        return plugin_name, event

    async def on_broadcast(self, trace: Trace, plugin_name: str, event: str, listener: Callable[..., Awaitable[None]]) -> None:
        self._broadcast_listeners[self._key(plugin_name, event)].append(listener)

    async def emit_broadcast(self, trace: Trace, plugin_name: str, event: str, payload: Any) -> None:
        listeners = list(self._broadcast_listeners.get(self._key(plugin_name, event), []))
        errors = []
        for listener in listeners:
            try:
                await listener(trace, payload)
            except Exception as error:
                errors.append(error)
        if errors:
            raise ExceptionGroup("Broadcast listeners failed", errors)

    async def on_event(self, trace: Trace, plugin_name: str, event: str, listener: Callable[..., Awaitable[None]]) -> None:
        self._event_listeners[self._key(plugin_name, event)].append(listener)

    async def emit_event(self, trace: Trace, plugin_name: str, event: str, payload: Any) -> None:
        key = self._key(plugin_name, event)
        listeners = list(self._event_listeners.get(key, []))
        if listeners:
            selected = self._round_robin[key] % len(listeners)
            self._round_robin[key] += 1
            await listeners[selected](trace, payload)

    async def on_returnable_event(
        self, trace: Trace, plugin_name: str, event: str, listener: Callable[..., Awaitable[Any]]
    ) -> None:
        key = self._key(plugin_name, event)
        if self._returnable_listeners[key]:
            raise RuntimeError("Duplicate returnable listener")
        self._returnable_listeners[key].append(listener)

    async def emit_event_and_return(
        self,
        trace: Trace,
        plugin_name: str,
        event: str,
        timeout_seconds: float,
        payload: Any,
    ) -> Any:
        listeners = list(self._returnable_listeners.get(self._key(plugin_name, event), []))
        if not listeners:
            raise RuntimeError(f"No returnable listener for {plugin_name}:{event}")
        task = asyncio.create_task(listeners[0](trace, payload))
        self._tasks.add(task)
        try:
            return await asyncio.wait_for(task, timeout=timeout_seconds)
        finally:
            self._tasks.discard(task)

    async def receive_stream(self, trace, plugin_name, event, handler, timeout_seconds=5):
        key = self._key(plugin_name, event)
        if type(timeout_seconds) not in (int, float) or not math.isfinite(timeout_seconds) or not 0 < timeout_seconds <= 86400:
            raise ValueError("Invalid stream timeout")
        stream_id = str(uuid.uuid4())
        started = asyncio.get_running_loop().create_future()
        stream = ByteStream(timeout_seconds)
        async def receive():
            called = False
            completed = False
            span = None
            try:
                parent = await asyncio.wait_for(started, timeout_seconds)
                span = self._obs.for_plugin(plugin_name).create_trace("stream.receive", parent=parent)
                called = True
                await handler(span, None, stream)
                if not stream.ended:
                    raise RuntimeError("Receiver must consume the stream through EOF")
                completed = True
            except Exception as error:
                stream.abort(error)
                if not called:
                    await handler(trace, error, None)
                raise
            finally:
                self._streams.pop(stream_id, None)
                sender = entry[4]
                if not completed and sender is not None and not sender.done() and sender.cancelling() == 0:
                    sender.cancel()
                if span:
                    span.end()
        task = asyncio.create_task(receive())
        entry = [key, started, stream, task, None]
        self._streams[stream_id] = entry
        self._tasks.add(task)
        def completed(done):
            self._tasks.discard(done)
            if not done.cancelled() and done.exception() is not None:
                self._obs.error(trace, str(done.exception()))
        task.add_done_callback(completed)
        return stream_id

    async def send_stream(self, trace, plugin_name, event, stream_id, source):
        key = self._key(plugin_name, event)
        entry = self._streams.get(stream_id)
        if entry is None or entry[0] != key or entry[1].done():
            raise ValueError("Unknown, mismatched or used stream ID")
        _, started, stream, task, _ = entry
        sender = asyncio.current_task()
        entry[4] = sender
        self._tasks.add(sender)
        started.set_result(trace)
        try:
            async for data in chunks(source):
                await stream.feed(data)
            await stream.feed(None)
            await asyncio.wait_for(asyncio.shield(task), stream.timeout_seconds)
        except BaseException as error:
            receiver_error = stream.error if stream.closed else None
            if not stream.closed:
                stream.abort(RuntimeError(str(error)))
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            if isinstance(error, asyncio.CancelledError) and receiver_error is not None:
                raise receiver_error
            raise
        finally:
            self._tasks.discard(sender)

    async def dispose(self):
        if self._closed:
            return
        self._closed = True
        for entry in self._streams.values():
            entry[2].abort(RuntimeError("Transport closed"))
        tasks = list(self._tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self._streams.clear()
        self._event_listeners.clear()
        self._broadcast_listeners.clear()
        self._returnable_listeners.clear()
