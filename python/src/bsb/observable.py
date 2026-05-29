from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any


def _fmt(message: str, meta: dict[str, Any] | None) -> str:
    if not meta:
        return message
    out = message
    for key, value in meta.items():
        out = out.replace("{" + key + "}", str(value))
    return out


@dataclass(slots=True)
class Trace:
    component: str
    span: str
    trace_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    span_id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])


class Counter:
    def __init__(self, name: str) -> None:
        self.name = name
        self.value = 0.0

    def increment(self, value: float = 1.0) -> None:
        self.value += value


class Gauge:
    def __init__(self, name: str) -> None:
        self.name = name
        self.value = 0.0

    def set(self, value: float) -> None:
        self.value = value


class SBObservable:
    def __init__(self, app_id: str, mode: str) -> None:
        self.app_id = app_id
        self.mode = mode
        self.logger = logging.getLogger(f"bsb.{app_id}")
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
            self.logger.addHandler(handler)
        self.logger.setLevel(logging.DEBUG if mode != "production" else logging.INFO)

    async def init(self) -> None:
        return None

    async def run(self) -> None:
        return None

    def dispose(self) -> None:
        return None


class ObservableBackend:
    def __init__(self, mode: str, app_id: str, plugin_name: str, sb_observable: SBObservable) -> None:
        self.mode = mode
        self.app_id = app_id
        self.plugin_name = plugin_name
        self._sb = sb_observable
        self._counters: dict[str, Counter] = {}
        self._gauges: dict[str, Gauge] = {}

    def create_trace(self, span: str, component: str | None = None) -> Trace:
        return Trace(component=component or self.plugin_name, span=span)

    def _log(self, level: str, trace: Trace, message: str, meta: dict[str, Any] | None = None) -> None:
        if level == "debug" and self.mode == "production":
            return
        text = f"[{self.plugin_name}] [{trace.component}/{trace.span}] {_fmt(message, meta)}"
        log_fn = getattr(self._sb.logger, level, self._sb.logger.info)
        log_fn(text)

    def debug(self, trace: Trace, message: str, meta: dict[str, Any] | None = None) -> None:
        self._log("debug", trace, message, meta)

    def info(self, trace: Trace, message: str, meta: dict[str, Any] | None = None) -> None:
        self._log("info", trace, message, meta)

    def warn(self, trace: Trace, message: str, meta: dict[str, Any] | None = None) -> None:
        self._log("warning", trace, message, meta)

    def error(self, trace: Trace, message: str, meta: dict[str, Any] | None = None) -> None:
        self._log("error", trace, message, meta)

    def create_counter(self, name: str) -> Counter:
        counter = Counter(name)
        self._counters[name] = counter
        return counter

    def create_gauge(self, name: str) -> Gauge:
        gauge = Gauge(name)
        self._gauges[name] = gauge
        return gauge

    @staticmethod
    def now_ns() -> int:
        return time.time_ns()
