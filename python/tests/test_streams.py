import asyncio
import threading

import pytest

from bsb.streams import chunks


def test_cancelled_blocking_reads_are_closed_and_unblocked():
    class Source:
        def __init__(self):
            self.closed = threading.Event()

        def read(self, _size):
            self.closed.wait()
            return b""

        def close(self):
            self.closed.set()

    async def check():
        for _ in range(3):
            source = Source()
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
