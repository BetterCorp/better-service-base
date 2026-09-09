from __future__ import annotations

import logging
import math
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def _fmt(message: str, meta: dict | None) -> str:
    for key, value in (meta or {}).items():
        message = message.replace("{" + key + "}", str(value))
    return message


@dataclass(slots=True)
class Trace:
    component: str
    span: str
    trace_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    span_id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])
    parent_span_id: str | None = None
    attributes: dict = field(default_factory=dict)
    started_ns: int = field(default_factory=time.time_ns)
    _clock: int = field(default_factory=time.perf_counter_ns)
    _backend: ObservableBackend | None = None
    _ended: bool = False
    _error: str | None = None

    def to_wire(self) -> dict[str, str]:
        return {"t": self.trace_id, "s": self.span_id}

    @property
    def log(self) -> Trace:
        return self

    @property
    def metrics(self) -> ObservableBackend:
        if self._backend is None:
            raise RuntimeError("Trace is not attached to an observable backend")
        return self._backend

    def start_span(self, name: str, attributes: dict | None = None, *, parent: Trace | dict | None = None) -> Trace:
        return self.metrics.create_trace(name, self.component, parent=parent or self, attributes=attributes)

    def set_attribute(self, key: str, value: Any) -> None:
        self.attributes[key] = value

    def debug(self, message: str, meta: dict | None = None) -> None:
        self.metrics.debug(self, message, meta)

    def info(self, message: str, meta: dict | None = None) -> None:
        self.metrics.info(self, message, meta)

    def warn(self, message: str, meta: dict | None = None) -> None:
        self.metrics.warn(self, message, meta)

    def error(self, error: Exception | str, meta: dict | None = None) -> None:
        self._error = str(error)
        self.metrics.error(self, str(error), meta)

    def end(self, attributes: dict | None = None) -> None:
        if self._ended:
            return
        self._ended = True
        self.attributes.update(attributes or {})
        if self._backend:
            self._backend._sb.emit("span", {
                "name": self.span, "pluginName": self._backend.plugin_name, "trace": self.to_wire(),
                "parentSpanId": self.parent_span_id, "startedNs": self.started_ns,
                "durationNs": max(0, time.perf_counter_ns() - self._clock), "attributes": self.attributes.copy(), "error": self._error,
            })


class Metric:
    kind = "gauge"

    def __init__(self, name: str, backend: ObservableBackend | None = None, description: str = "", unit: str = "") -> None:
        self.name, self.backend, self.description, self.unit = name, backend, description, unit
        self.value = 0.0
        self._states: dict[tuple, dict] = {}

    def _record(self, value: float, labels: dict[str, str] | None, increment: bool = False) -> None:
        if not math.isfinite(value) or self.kind == "counter" and value < 0:
            raise ValueError("Metric value must be finite; counters cannot decrease")
        key = tuple(sorted((labels or {}).items()))
        if len(self._states) >= 10000 and key not in self._states:
            return
        state = self._states.setdefault(key, {"value": 0.0, "count": 0, "sum": 0.0, "min": value, "max": value, "startedNs": time.time_ns()})
        self.value = state["value"] = state["value"] + value if increment else value
        state["count"] += 1
        state["sum"] += value
        state["min"], state["max"] = min(state["min"], value), max(state["max"], value)
        if self.backend:
            self.backend._sb.emit("metric", {**state, "name": self.name, "kind": self.kind,
                "plugin": self.backend.plugin_name, "description": self.description, "unit": self.unit,
                "labels": dict(key), "timestampNs": time.time_ns()})


class Counter(Metric):
    kind = "counter"

    def increment(self, value: float = 1, labels: dict[str, str] | None = None) -> None:
        self._record(value, labels, True)


class Gauge(Metric):
    def set(self, value: float, labels: dict[str, str] | None = None) -> None:
        self._record(value, labels)

    def increment(self, value: float = 1, labels: dict[str, str] | None = None) -> None:
        self._record(value, labels, True)

    def decrement(self, value: float = 1, labels: dict[str, str] | None = None) -> None:
        self._record(-value, labels, True)


class Histogram(Metric):
    kind = "histogram"

    def record(self, value: float, labels: dict[str, str] | None = None) -> None:
        self._record(value, labels)


class SBObservable:
    def __init__(self, app_id: str, mode: str) -> None:
        self.app_id, self.mode = app_id, mode
        self.plugins: list[Any] = []
        self.instruments: dict[tuple[str, str], Metric] = {}
        self.logger = logging.getLogger(f"bsb.{app_id}")
        if not self.logger.handlers:
            self.logger.addHandler(logging.StreamHandler())
        self.logger.setLevel(logging.DEBUG if mode != "production" else logging.INFO)

    async def init(self, config=None, loader=None, cwd: str = ".") -> None:
        if config is None:
            return
        from .base import PluginCtor, validate_plugin_config
        definitions = await config.get_observable_plugins()
        if not definitions:
            definitions = {"observable-default": {"plugin": "observable-default"}}
        for name, definition in definitions.items():
            loaded = await loader.load_plugin("observable", definition.get("package"), definition.get("plugin", name), name, definition.get("version"), definition.get("language"))
            backend = ObservableBackend(self.mode, self.app_id, name, self)
            instance = loaded.plugin(PluginCtor(self.app_id, self.mode, name, cwd, loaded.package_cwd, loaded.plugin_cwd,
                validate_plugin_config(loaded.service_config, definition.get("config"), f"Invalid observable config {name}"), loaded.version, backend))
            self.plugins.append(instance)
            trace = backend.create_trace("init")
            try:
                await instance.init(trace)
            finally:
                trace.end()

    async def run(self) -> None:
        for plugin in self.plugins:
            trace = plugin._obs.create_trace("run")
            try:
                await plugin.run(trace)
            finally:
                trace.end()

    async def dispose(self) -> None:
        from .base import dispose_all
        await dispose_all(reversed(self.plugins))
        self.plugins.clear()

    def emit(self, signal: str, value: dict, message_template: str | None = None) -> None:
        if not self.plugins and signal == "log":
            self.logger.log({"trace": 10, "debug": 10, "info": 20, "warn": 30, "error": 40, "fatal": 50}[value["level"]], value["message"])
        for plugin in self.plugins:
            redact_log = getattr(plugin, "_redact_log", None)
            getattr(plugin, "emit_" + signal)(redact_log(value, message_template) if signal == "log" and message_template is not None and redact_log else value)


class ObservableBackend:
    def __init__(self, mode: str, app_id: str, plugin_name: str, sb_observable: SBObservable) -> None:
        self.mode, self.app_id, self.plugin_name, self._sb = mode, app_id, plugin_name, sb_observable

    def for_plugin(self, name: str) -> ObservableBackend:
        return ObservableBackend(self.mode, self.app_id, name, self._sb)

    def create_trace(self, span: str, component: str | None = None, *, parent: Trace | dict | None = None, attributes: dict | None = None) -> Trace:
        trace = Trace(component=component or self.plugin_name, span=span, attributes=dict(attributes or {}), _backend=self)
        if parent is not None:
            wire = parent.to_wire() if isinstance(parent, Trace) else parent
            if not isinstance(wire, dict) or not re.fullmatch(r"[0-9a-f]{32}", str(wire.get("t", ""))) or not re.fullmatch(r"[0-9a-f]{16}", str(wire.get("s", ""))) or int(wire["t"], 16) == 0 or int(wire["s"], 16) == 0:
                raise ValueError("Invalid distributed trace context")
            trace.trace_id, trace.parent_span_id = wire["t"], wire["s"]
        return trace

    def _log(self, level: str, trace: Trace, message: str, meta: dict | None = None) -> None:
        self._sb.emit("log", {"timestamp": datetime.now(timezone.utc).isoformat(), "level": level,
            "plugin": self.plugin_name, "message": _fmt(message, meta), "meta": dict(meta or {}), "traceId": trace.trace_id, "spanId": trace.span_id}, message)

    def debug(self, trace: Trace, message: str, meta: dict | None = None) -> None:
        self._log("debug", trace, message, meta)

    def info(self, trace: Trace, message: str, meta: dict | None = None) -> None:
        self._log("info", trace, message, meta)

    def warn(self, trace: Trace, message: str, meta: dict | None = None) -> None:
        self._log("warn", trace, message, meta)

    def error(self, trace: Trace, message: str, meta: dict | None = None) -> None:
        self._log("error", trace, message, meta)

    def _instrument(self, cls, name: str, description: str, unit: str):
        key = (self.plugin_name, name)
        existing = self._sb.instruments.get(key)
        if existing is not None and (type(existing), existing.description, existing.unit) != (cls, description, unit):
            raise ValueError(f"Conflicting metric definition {name}")
        if existing is None:
            existing = self._sb.instruments[key] = cls(name, self, description, unit)
        return existing

    def create_counter(self, name: str, description: str = "", unit: str = "") -> Counter:
        return self._instrument(Counter, name, description, unit)

    def create_gauge(self, name: str, description: str = "", unit: str = "") -> Gauge:
        return self._instrument(Gauge, name, description, unit)

    def create_histogram(self, name: str, description: str = "", unit: str = "") -> Histogram:
        return self._instrument(Histogram, name, description, unit)

    counter, gauge, histogram = create_counter, create_gauge, create_histogram
    now_ns = staticmethod(time.time_ns)
