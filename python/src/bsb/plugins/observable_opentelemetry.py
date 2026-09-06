from ..schema import object_schema
from ..telemetry import HttpTelemetry, fields, otlp

class Config:
    metadata = {"name": "observable-opentelemetry", "description": "Native OTLP HTTP JSON logs, traces and metrics", "category": "observable"}
    validation_schema = object_schema(fields("http://localhost:4318"))

class Plugin(HttpTelemetry):
    async def export(self, batch):
        for signal in self.signals:
            entries = [entry for entry in batch if entry["signal"] == signal]
            if entries:
                await self.send(self.endpoint("v1/" + signal), otlp(signal, entries, self.config))
