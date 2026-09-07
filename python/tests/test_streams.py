import asyncio
import threading

import pytest

from bsb.base import PluginCtor
from bsb.observable import ObservableBackend, SBObservable
from bsb.streams import chunks
from bsb_python_plugins.events_default import Plugin as LocalEvents


def local_events():
    backend = ObservableBackend("development", "test", "events", SBObservable("test", "development"))
    return LocalEvents(PluginCtor("test", "development", "events", ".", "", "", {}, "1.0.0", backend)), backend.create_trace("test")


class BlockingSource:
    def __init__(self):
        self.closed = threading.Event()
        self.entered = threading.Event()

    def read(self, _size):
        self.entered.set()
        self.closed.wait()
        return b""

    def close(self):
        self.closed.set()


def test_cancelled_blocking_reads_are_closed_and_unblocked():
    async def check():
        for _ in range(3):
            source = BlockingSource()
            stream = chunks(source)
            with pytest.raises(TimeoutError):
                await asyncio.wait_for(anext(stream), .05)
            assert source.closed.is_set()

    asyncio.run(check())


def test_blocking_sources_must_be_closable():
    class Source:
        def read(self, _size):
            return b""

    async def check():
        with pytest.raises(TypeError, match=r"provide close\(\)"):
            await anext(chunks(Source()))

    asyncio.run(check())


def test_async_read_source_does_not_need_close():
    class Source:
        async def read(self, _size):
            return b"value"

    async def check():
        assert await anext(chunks(Source())) == b"value"

    asyncio.run(check())


def test_read_error_during_cancellation_does_not_replace_timeout():
    class Source:
        def __init__(self):
            self.closed = threading.Event()

        def read(self, _size):
            self.closed.wait()
            raise OSError("closed")

        def close(self):
            self.closed.set()

    async def check():
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(anext(chunks(Source())), .05)

    asyncio.run(check())


def test_local_stream_initial_wait_uses_negotiated_timeout():
    async def check():
        events, trace = local_events()
        failures = []
        called = asyncio.Event()

        async def handler(_trace, error, stream):
            failures.append((error, stream))
            called.set()

        await events.receive_stream(trace, "worker", "bytes", handler, .05)
        await asyncio.wait_for(called.wait(), .5)
        assert len(failures) == 1
        assert isinstance(failures[0][0], TimeoutError)
        assert failures[0][1] is None

    asyncio.run(check())


def test_local_receiver_abort_cancels_blocked_sender_read():
    async def check():
        events, trace = local_events()
        source = BlockingSource()

        async def handler(_trace, _error, stream):
            assert await asyncio.to_thread(source.entered.wait, .5)
            await stream.read()

        stream_id = await events.receive_stream(trace, "worker", "bytes", handler, .05)
        sender = asyncio.create_task(events.send_stream(trace, "worker", "bytes", stream_id, source))
        try:
            done, _ = await asyncio.wait({sender}, timeout=.5)
            assert sender in done
            with pytest.raises(TimeoutError):
                sender.result()
            assert source.closed.is_set()
        finally:
            source.close()
            sender.cancel()
            await asyncio.gather(sender, return_exceptions=True)

    asyncio.run(check())


def test_local_dispose_does_not_interrupt_sender_cancellation_cleanup():
    async def check():
        events, trace = local_events()
        source = BlockingSource()

        async def handler(_trace, _error, stream):
            await stream.read()

        stream_id = await events.receive_stream(trace, "worker", "bytes", handler, 1)
        sender = asyncio.create_task(events.send_stream(trace, "worker", "bytes", stream_id, source))
        try:
            assert await asyncio.to_thread(source.entered.wait, .5)
            await asyncio.wait_for(events.dispose(), .5)
            assert source.closed.is_set()
            with pytest.raises(RuntimeError, match="Transport closed"):
                sender.result()
        finally:
            source.close()
            sender.cancel()
            await asyncio.gather(sender, return_exceptions=True)

    asyncio.run(check())


def test_local_sender_external_cancellation_stays_cancelled():
    async def check():
        events, trace = local_events()
        source = BlockingSource()

        async def handler(_trace, _error, stream):
            await stream.read()

        stream_id = await events.receive_stream(trace, "worker", "bytes", handler, 1)
        sender = asyncio.create_task(events.send_stream(trace, "worker", "bytes", stream_id, source))
        try:
            assert await asyncio.to_thread(source.entered.wait, .5)
            sender.cancel()
            done, _ = await asyncio.wait({sender}, timeout=.5)
            assert sender in done
            with pytest.raises(asyncio.CancelledError):
                sender.result()
            assert source.closed.is_set()
        finally:
            source.close()
            sender.cancel()
            await asyncio.gather(sender, return_exceptions=True)

    asyncio.run(check())
