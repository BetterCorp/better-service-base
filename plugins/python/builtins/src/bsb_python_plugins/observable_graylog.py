import asyncio
from datetime import datetime
import gzip
import json
import os
import re
import socket

from bsb.http import origin
from bsb.network_logging import NetworkLogging, fields
from bsb.schema import av, object_schema
from bsb.telemetry import post
from .observable_syslog import severity


class Config:
    metadata = {"name": "observable-graylog", "description": "Native GELF UDP/TCP/TLS/HTTP logging", "category": "observable"}
    validation_schema = object_schema({**fields(12201, True), "facility": av.string().default("bsb"), "compress": av.bool_().default(True),
        "httpEndpoint": av.optional(av.string().min_length(1)), "headers": av.record(av.string()).default({}).describe("GELF HTTP headers", sensitive=True),
        "additionalFields": av.record(av.unknown()).default({})})


def format_entry(entry, config):
    message = {"version": "1.1", "host": socket.gethostname(), "short_message": entry["message"],
        "full_message": json.dumps(entry, default=str), "timestamp": datetime.fromisoformat(entry["timestamp"]).timestamp(),
        "level": severity(entry["level"]), "_facility": config["facility"], "_plugin": entry["plugin"],
        "_trace_id": entry["traceId"], "_span_id": entry["spanId"]}
    for key, value in config["additionalFields"].items():
        name = "_" + key.lstrip("_")
        if name != "_id" and name not in message and re.fullmatch(r"_[A-Za-z0-9_.-]+", name):
            message[name] = value if type(value) in (str, float, int) else json.dumps(value, default=str)
    return message


def datagrams(message, compress):
    data = json.dumps(message, default=str, ensure_ascii=False).encode()
    if compress:
        data = gzip.compress(data, compresslevel=1)
    if len(data) <= 1200:
        return [data]
    count = (len(data) + 1187) // 1188
    if count > 128:
        raise ValueError("GELF message exceeds 128 chunks")
    identity = os.urandom(8)
    return [b"\x1e\x0f" + identity + bytes([index, count]) + data[index * 1188:(index + 1) * 1188] for index in range(count)]


class Plugin(NetworkLogging):
    async def init(self, trace):
        if self.config["protocol"] == "http":
            host = self.config["host"]
            if ":" in host and not host.startswith("["):
                host = f"[{host}]"
            self.url = self.config.get("httpEndpoint") or f"http://{host}:{self.config['port']}/gelf"
            origin(self.url, allow_http=True)

    async def export(self, batch):
        for entry in batch:
            message = format_entry(entry, self.config)
            if self.config["protocol"] == "http":
                await asyncio.to_thread(post, self.url, message, self.config["headers"])
            elif self.config["protocol"] == "udp":
                for data in datagrams(message, self.config["compress"]):
                    await self.send_bytes(data)
            else:
                await self.send_bytes(json.dumps(message, default=str).encode() + b"\0")
