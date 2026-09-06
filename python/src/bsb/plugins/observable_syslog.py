from datetime import datetime
import json
import os
import socket

from ..network_logging import NetworkLogging, fields
from ..schema import av, object_schema


def severity(level):
    return {"trace": 7, "debug": 7, "info": 6, "warn": 4, "error": 3, "fatal": 2}[level]


class Config:
    metadata = {"name": "observable-syslog", "description": "Native RFC 5424/3164 UDP/TCP/TLS logging", "category": "observable"}
    validation_schema = object_schema({**fields(514), "facility": av.int32().min(0).max(23).default(16),
        "hostname": av.string().min_length(1).max_length(255).default(socket.gethostname()),
        "appName": av.string().min_length(1).max_length(48).default("bsb-app"),
        "rfc": av.enum_(["3164", "5424"]).default("5424"), "framing": av.enum_(["newline", "octet-counting"]).default("newline")})


def format_entry(entry, config):
    def field(value): return "".join(char if "!" <= char <= "~" else "_" for char in value)
    priority = config["facility"] * 8 + severity(entry["level"])
    timestamp = datetime.fromisoformat(entry["timestamp"])
    host, app = field(config["hostname"]), field(config["appName"])
    if config["rfc"] == "5424":
        prefix = f"<{priority}>1 {timestamp.isoformat()} {host} {app} {os.getpid()} - - "
    else:
        month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][timestamp.month - 1]
        prefix = f"<{priority}>{month} {timestamp.day:2} {timestamp:%H:%M:%S} {host} {app}[{os.getpid()}]: "
    data = (prefix + json.dumps(entry, default=str, ensure_ascii=False)).encode()
    if config["protocol"] == "udp": return data
    if config["protocol"] == "tls" or config["framing"] == "octet-counting": return str(len(data)).encode() + b" " + data
    return data + b"\n"


class Plugin(NetworkLogging):
    async def export(self, batch):
        for entry in batch:
            await self.send_bytes(format_entry(entry, self.config))
