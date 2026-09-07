from copy import deepcopy
import gzip
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import shutil
import time
import uuid

from .base import BSBObservable
from .observable import _fmt
from .schema import av, object_schema


LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"]
LOG_FIELDS = {
    "level": av.enum_(LEVELS).default("info"), "redact": av.array(av.string().min_length(1)).default([]),
    "prettyPrint": av.bool_().default(False), "base": av.record(av.unknown()).default({}),
    "filePath": av.optional(av.string().min_length(1)), "maxBytes": av.int64().min(1).default(10485760),
    "maxFiles": av.int32().min(0).default(7), "interval": av.enum_(["none", "hourly", "daily"]).default("daily"),
    "compress": av.bool_().default(True),
}


def redact(entry, paths):
    entry = deepcopy(entry)
    def visit(value, parts):
        if not parts or not isinstance(value, (dict, list)):
            return
        keys = range(len(value)) if isinstance(value, list) else list(value)
        for key in keys:
            if parts[0] in ("*", str(key)):
                if len(parts) == 1:
                    value[key] = "[REDACTED]"
                else:
                    visit(value[key], parts[1:])
    for path in paths:
        visit(entry, path.split("."))
    return entry


def redact_log(entry, message, paths):
    meta = entry.get("meta", {})
    entry = redact(entry, paths)
    values = entry["meta"] if isinstance(entry["meta"], dict) else dict.fromkeys(meta, "[REDACTED]") if isinstance(meta, dict) else {}
    entry["message"] = _fmt(message, values)
    return entry


class RotatingLogFile(RotatingFileHandler):
    def __init__(self, path, config):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.interval = {"none": 0, "hourly": 3600, "daily": 86400}[config["interval"]]
        self.opened = os.path.getmtime(path) if os.path.exists(path) else time.time()
        self.compress = config["compress"]
        super().__init__(path, maxBytes=config["maxBytes"], backupCount=config["maxFiles"], encoding="utf-8", delay=True)
        if self.compress:
            self.namer = lambda name: name + ".gz"
            self.rotator = self.zip_file

    @staticmethod
    def zip_file(source, destination):
        try:
            with open(source, "rb") as incoming, gzip.open(destination, "wb") as output:
                shutil.copyfileobj(incoming, output)
        except BaseException:
            if os.path.exists(destination):
                os.unlink(destination)
            raise
        os.unlink(source)

    def shouldRollover(self, record):
        size = os.path.getsize(self.baseFilename) if os.path.exists(self.baseFilename) else 0
        return size > 0 and (size + len((self.format(record) + "\n").encode()) > self.maxBytes or
            self.interval > 0 and time.time() - self.opened >= self.interval)

    def doRollover(self):
        if self.backupCount:
            super().doRollover()
        else:
            if self.stream:
                self.stream.close()
                self.stream = None
            archive = self.rotation_filename(self.baseFilename + ".bsb-" + str(time.time_ns()) + "-" + uuid.uuid4().hex)
            self.rotate(self.baseFilename, archive)
        self.opened = time.time()

    def handleError(self, record):
        raise  # A full disk must not silently discard application logs.


class StructuredLogging(BSBObservable):
    file_only = False
    numeric_level = False
    _file = None

    async def init(self, trace):
        path = self.config.get("path") if self.file_only else self.config.get("filePath")
        if path:
            self._file = RotatingLogFile(Path(self.cwd) / path, self.config)

    def _redact_log(self, entry, message):
        return redact_log({**self.config.get("base", {}), **entry}, message, self.config["redact"])

    def emit_log(self, entry):
        level = entry["level"]
        if LEVELS.index(level) < LEVELS.index(self.config["level"]):
            return
        entry = redact({**self.config.get("base", {}), **entry}, self.config["redact"])
        if self.numeric_level:
            entry["level"], entry["msg"] = (LEVELS.index(level) + 1) * 10, entry.pop("message")
        text = json.dumps(entry, default=str, ensure_ascii=False)
        if not self.file_only:
            print(f"{entry['timestamp']} {level} [{entry['plugin']}] {entry.get('msg', entry.get('message'))} {entry.get('meta')}" if self.config["prettyPrint"] else text, flush=True)
        if self._file:
            self._file.handle(logging.LogRecord(self.plugin_name, logging.INFO, "", 0, text, (), None))

    def dispose(self):
        if self._file:
            self._file.close()
            self._file = None
