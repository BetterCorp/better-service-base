import asyncio
from datetime import datetime, timezone
import time
from bsb.base import BSBService
from bsb.schema import av, object_schema
from bsb.schema_events import import_event_schemas
from .clients.service_benchmarkify import BenchmarkifyClient

class Config:
    metadata = {"name": "service-benchmarkify", "category": "service"}
    validation_schema = object_schema({"iterations": av.int32().min(1).max(100000).default(1000)})

class Plugin(BSBService):
    EventSchemas = import_event_schemas(BenchmarkifyClient.schema)
    def __init__(self, ctor):
        super().__init__(ctor)
        self.client = BenchmarkifyClient(self, self.plugin_name)
        self.running = asyncio.Lock()
    async def init(self, trace):
        async def add(span, value): return value["a"] + value["b"]
        async def void(span, value): return None
        async def trigger(span, value): await self.run(span)
        await self.events.on_returnable_event("add", add, obs=trace)
        await self.events.on_returnable_event("void", void, obs=trace)
        await self.events.on_event("benchmark.trigger", trigger, obs=trace)
    async def run(self, trace):
        if self.running.locked(): raise RuntimeError("Benchmark already running")
        async with self.running:
            results = []
            for operation in ("add", "void"):
                start = time.perf_counter()
                for _ in range(self.config["iterations"]):
                    if operation == "add": await self.client.add({"a": 5, "b": 3}, obs=trace)
                    else: await self.client.void({}, obs=trace)
                elapsed = time.perf_counter() - start
                results.append({"operation": operation, "duration": elapsed * 1000, "opsPerSecond": self.config["iterations"] / max(elapsed, .000001)})
            await self.events.emit_broadcast("benchmark.results", {"testName": "native-rpc", "results": results, "timestamp": datetime.now(timezone.utc).isoformat()}, obs=trace)
