import asyncio
from pathlib import Path
import socket
import ssl

from .logging import LEVELS
from .schema import av
from .telemetry import BufferedTelemetry


def fields(port, http=False):
    return {"host": av.string().min_length(1).default("localhost"), "port": av.int32().min(1).max(65535).default(port),
        "protocol": av.enum_(["udp", "tcp", "tls", "http"] if http else ["udp", "tcp", "tls"]).default("udp"),
        "level": av.enum_(LEVELS).default("info"), "redact": av.array(av.string().min_length(1)).default([]),
        "caCertificatePath": av.optional(av.string().min_length(1)), "clientCertificatePath": av.optional(av.string().min_length(1)),
        "clientKeyPath": av.optional(av.string().min_length(1)), "flushIntervalMs": av.int32().min(100).max(60000).default(1000)}


class NetworkLogging(BufferedTelemetry):
    signals = ("logs",)
    _socket = None
    _writer = None

    def tls_context(self):
        ca = self.config.get("caCertificatePath")
        context = ssl.create_default_context(cafile=str(Path(self.cwd) / ca) if ca else None)
        certificate, key = self.config.get("clientCertificatePath"), self.config.get("clientKeyPath")
        if key and not certificate:
            raise ValueError("A client key requires a client certificate")
        if certificate:
            context.load_cert_chain(str(Path(self.cwd) / certificate), str(Path(self.cwd) / key) if key else None)
        return context

    async def send_bytes(self, data):
        try:
            async with asyncio.timeout(5):
                if self.config["protocol"] == "udp":
                    if len(data) > 65507:
                        raise ValueError("UDP log exceeds datagram limit")
                    loop = asyncio.get_running_loop()
                    if self._socket is None:
                        addresses = await loop.getaddrinfo(self.config["host"], self.config["port"], type=socket.SOCK_DGRAM)
                        family, kind, protocol, _, address = addresses[0]
                        self._socket = socket.socket(family, kind, protocol)
                        self._socket.setblocking(False)
                        await loop.sock_connect(self._socket, address)
                    await loop.sock_sendall(self._socket, data)
                else:
                    if self._writer is None:
                        context = self.tls_context() if self.config["protocol"] == "tls" else None
                        _, self._writer = await asyncio.open_connection(self.config["host"], self.config["port"], ssl=context)
                    self._writer.write(data)
                    await self._writer.drain()
        except BaseException:
            await self.close_socket()
            raise

    async def close_socket(self):
        if self._socket:
            self._socket.close()
            self._socket = None
        if self._writer:
            writer, self._writer = self._writer, None
            writer.close()
            try:
                await asyncio.wait_for(writer.wait_closed(), 1)
            except (OSError, TimeoutError):
                pass

    async def dispose(self):
        try:
            await super().dispose()
        finally:
            await self.close_socket()
