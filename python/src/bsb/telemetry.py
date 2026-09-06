"""Bounded native telemetry exporters; transport work never runs in application log calls."""
import asyncio
from datetime import datetime
import json
from queue import Empty, Full, Queue
import sys
import time
from urllib.error import HTTPError, URLError

from .base import BSBObservable
from .http import json_request, origin
from .logging import LEVELS, redact
from .schema import av


def fields(endpoint):
    return {
        "endpoint": av.string().min_length(1).default(endpoint), "serviceName": av.string().min_length(1).default("bsb-service"),
        "serviceVersion": av.optional(av.string()), "headers": av.record(av.string()).default({}).describe("HTTP headers", sensitive=True),
        "resourceAttributes": av.record(av.string()).default({}),
        "flushIntervalMs": av.int32().min(100).max(60000).default(5000), "maxBatchSize": av.int32().min(1).max(4096).default(512),
        "samplingRate": av.number().min(0).max(1).default(1),
        "logs": av.bool_().default(True), "metrics": av.bool_().default(True), "traces": av.bool_().default(True),
        "level": av.enum_(LEVELS).default("info"), "redact": av.array(av.string().min_length(1)).default([]),
    }


def value(item):
    if isinstance(item, bool): return {"boolValue": item}
    if isinstance(item, int) and -(2**63) <= item < 2**63: return {"intValue": str(item)}
    if isinstance(item, float): return {"doubleValue": item}
    if isinstance(item, dict): return {"kvlistValue": {"values": attributes(item)}}
    if isinstance(item, (list, tuple)): return {"arrayValue": {"values": [value(part) for part in item]}}
    return {"stringValue": "null" if item is None else str(item)}


def attributes(items):
    return [{"key": str(key), "value": value(item)} for key, item in items.items()]


def resource(config):
    data = {**config["resourceAttributes"], "service.name": config["serviceName"]}
    if config.get("serviceVersion"):
        data["service.version"] = config["serviceVersion"]
    return {"attributes": attributes(data)}


def otlp(signal, entries, config):
    scopes = {}
    for entry in entries:
        plugin = entry.get("pluginName", entry.get("plugin", "bsb"))
        scopes.setdefault(plugin, []).append(entry)
    result = []
    for plugin, batch in scopes.items():
        scope = {"scope": {"name": plugin}}
        if signal == "traces":
            scope["spans"] = [{"traceId": item["trace"]["t"], "spanId": item["trace"]["s"],
                **({"parentSpanId": item["parentSpanId"]} if item.get("parentSpanId") else {}),
                "name": item["name"], "kind": 1, "startTimeUnixNano": str(item["startedNs"]),
                "endTimeUnixNano": str(item["startedNs"] + item["durationNs"]), "attributes": attributes(item["attributes"]),
                "status": {"code": 2, "message": item["error"]} if item.get("error") else {"code": 0}} for item in batch]
        elif signal == "logs":
            scope["logRecords"] = [{"timeUnixNano": str(int(datetime.fromisoformat(item["timestamp"]).timestamp() * 1_000_000_000)),
                "severityNumber": [1, 5, 9, 13, 17, 21][LEVELS.index(item["level"])], "severityText": item["level"].upper(),
                "body": value(item["message"]), "traceId": item["traceId"], "spanId": item["spanId"],
                "attributes": attributes(item.get("meta", {}))} for item in batch]
        else:
            metrics = {}
            # Cumulative instruments only need the newest observation of each series in this batch.
            series = {(item["name"], tuple(sorted(item["labels"].items()))): item for item in batch}
            for item in series.values():
                metric = metrics.setdefault(item["name"], {"name": item["name"], "description": item["description"], "unit": item["unit"]})
                point = {"startTimeUnixNano": str(item["startedNs"]), "timeUnixNano": str(item["timestampNs"]), "attributes": attributes(item["labels"])}
                if item["kind"] == "histogram":
                    point.update(count=str(item["count"]), sum=item["sum"], min=item["min"], max=item["max"], bucketCounts=[str(item["count"])], explicitBounds=[])
                    metric.setdefault("histogram", {"aggregationTemporality": 2, "dataPoints": []})["dataPoints"].append(point)
                else:
                    point["asDouble"] = item["value"]
                    data = metric.setdefault("sum" if item["kind"] == "counter" else "gauge", {"dataPoints": []})
                    if item["kind"] == "counter":
                        data.update(aggregationTemporality=2, isMonotonic=True)
                    data["dataPoints"].append(point)
            scope["metrics"] = list(metrics.values())
        result.append(scope)
    name = {"traces": "Spans", "logs": "Logs", "metrics": "Metrics"}[signal]
    return {"resource" + name: [{"resource": resource(config), "scope" + name: result}]}


def zipkin(entries, config):
    return [{"traceId": item["trace"]["t"], "id": item["trace"]["s"],
        **({"parentId": item["parentSpanId"]} if item.get("parentSpanId") else {}),
        "name": item["name"], "timestamp": item["startedNs"] // 1000, "duration": max(1, item["durationNs"] // 1000),
        "localEndpoint": {"serviceName": config["serviceName"]},
        "tags": {**{key: str(item) for key, item in item["attributes"].items()}, **({"error": item["error"]} if item.get("error") else {})}}
        for item in entries]


def post(url, body, headers):
    if len(json.dumps(body, allow_nan=False).encode()) > 64 * 1024 * 1024:
        raise ValueError("Telemetry request exceeds 64 MiB")
    for attempt in range(3):
        try:
            result = json_request("POST", url, body=body, headers=headers)
            if isinstance(result, dict):
                partial = result.get("partialSuccess", {})
                if any(int(partial.get(key, 0)) for key in ("rejectedLogRecords", "rejectedSpans", "rejectedDataPoints")) or partial.get("errorMessage"):
                    raise ValueError("Collector reported partial rejection")
                if result.get("failed", 0):
                    raise ValueError("Collector rejected events")
            return
        except HTTPError as error:
            if error.code not in (429, 502, 503, 504) or attempt == 2:
                raise
            retry = error.headers.get("Retry-After", "")
            delay = min(float(retry), 5) if retry.isdecimal() else .25 * (attempt + 1)
        except (URLError, TimeoutError, ConnectionError):
            if attempt == 2:
                raise
            delay = .25 * (attempt + 1)
        time.sleep(delay)


class BufferedTelemetry(BSBObservable):
    signals = ("logs", "metrics", "traces")

    def __init__(self, ctor):
        super().__init__(ctor)
        self._queue = Queue(4096)
        self._closed = False
        self._dropped = 0
        self._worker = None
        self._stop = asyncio.Event()

    def enqueue(self, signal, entry):
        if self._closed or signal not in self.signals or not self.config.get(signal, True):
            return
        if signal == "logs" and LEVELS.index(entry["level"]) < LEVELS.index(self.config.get("level", "info")):
            return
        if signal == "traces" and int(entry["trace"]["t"][:8], 16) / 2**32 >= self.config.get("samplingRate", 1):
            return
        item = {**redact(entry, self.config.get("redact", [])), "signal": signal}
        try:
            self._queue.put_nowait(item)
        except Full:
            self._dropped += 1
            if self._dropped % 1000 == 1:
                print(f"[{self.plugin_name}] Telemetry queue full; dropped {self._dropped} entries", file=sys.stderr)

    def emit_log(self, entry): self.enqueue("logs", entry)
    def emit_metric(self, entry): self.enqueue("metrics", entry)
    def emit_span(self, entry): self.enqueue("traces", entry)

    async def run(self, trace):
        if self._worker is None:
            self._worker = asyncio.create_task(self.pump())

    async def pump(self):
        while True:
            try:
                await asyncio.wait_for(self._stop.wait(), self.config.get("flushIntervalMs", 5000) / 1000)
            except TimeoutError:
                pass
            while not self._queue.empty():
                batch = []
                for _ in range(self.config.get("maxBatchSize", 512)):
                    try:
                        batch.append(self._queue.get_nowait())
                    except Empty:
                        break
                try:
                    await self.export(batch)
                except Exception as error:
                    print(f"[{self.plugin_name}] Export failed ({len(batch)} entries): {type(error).__name__}", file=sys.stderr)
            if self._closed:
                return

    async def dispose(self):
        if self._closed:
            return
        self._closed = True
        self._stop.set()
        if self._worker is None:
            self._worker = asyncio.create_task(self.pump())
        try:
            await asyncio.wait_for(self._worker, 10)
        except TimeoutError:
            print(f"[{self.plugin_name}] Telemetry shutdown deadline reached", file=sys.stderr)


class HttpTelemetry(BufferedTelemetry):
    async def init(self, trace):
        origin(self.config["endpoint"], allow_http=True)

    def endpoint(self, path):
        return self.config["endpoint"].rstrip("/") + "/" + path.lstrip("/")

    async def send(self, url, body, headers=None):
        await asyncio.to_thread(post, url, body, self.config["headers"] if headers is None else headers)
