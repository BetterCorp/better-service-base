from __future__ import annotations

import asyncio
import inspect
from typing import Any


class ByteStream:
    """Bounded asynchronous byte stream shared by local and Rabbit transports."""
    def __init__(self, timeout_seconds: float, request=None) -> None:
        self.queue: asyncio.Queue[bytes | None] = asyncio.Queue(8)
        self.timeout_seconds = timeout_seconds
        self.error: Exception | None = None
        self.ended = False
        self.closed = False
        self._pending = b""
        self._request = request

    async def feed(self, data: bytes | None) -> None:
        if self.closed:
            raise RuntimeError("Stream is closed")
        await asyncio.wait_for(self.queue.put(data), self.timeout_seconds)
        if self.closed:
            raise RuntimeError("Stream is closed")

    def abort(self, error: Exception) -> None:
        self.closed, self.error = True, error
        self._pending = b""
        while not self.queue.empty():
            self.queue.get_nowait()
        self.queue.put_nowait(None)

    async def read(self, size: int = -1) -> bytes:
        if size == 0:
            return b""
        parts = []
        length = 0
        while size < 0 or length < size:
            if not self._pending:
                if self.ended:
                    break
                if self._request and self.queue.empty():
                    await self._request()
                part = await asyncio.wait_for(self.queue.get(), self.timeout_seconds)
                if part is None:
                    self.ended = True
                    if self.error:
                        raise self.error
                    break
                self._pending = part
            count = len(self._pending) if size < 0 else min(size - length, len(self._pending))
            parts.append(self._pending[:count])
            self._pending = self._pending[count:]
            length += count
        return b"".join(parts)

    def __aiter__(self):
        return self

    async def __anext__(self):
        value = await self.read(65536)
        if not value:
            raise StopAsyncIteration
        return value


async def chunks(source: Any):
    if isinstance(source, (bytes, bytearray, memoryview)):
        for offset in range(0, len(source), 65536):
            yield bytes(source[offset:offset + 65536])
    elif hasattr(source, "__aiter__"):
        async for data in source:
            if not isinstance(data, (bytes, bytearray, memoryview)):
                raise TypeError("Streams transfer bytes")
            for offset in range(0, len(data), 65536):
                yield bytes(data[offset:offset + 65536])
    else:
        asynchronous = inspect.iscoroutinefunction(source.read)
        close = getattr(source, "close", None)
        if not asynchronous and not callable(close):
            raise TypeError("Synchronous stream sources must provide close()")
        while True:
            if asynchronous:
                data = await source.read(65536)
            else:
                read = asyncio.create_task(asyncio.to_thread(source.read, 65536))
                try:
                    data = await asyncio.shield(read)
                except asyncio.CancelledError:
                    try:
                        close()
                    except Exception:
                        pass
                    await asyncio.gather(read, return_exceptions=True)
                    raise
            if not data:
                break
            if not isinstance(data, bytes):
                raise TypeError("Streams transfer bytes")
            yield data
