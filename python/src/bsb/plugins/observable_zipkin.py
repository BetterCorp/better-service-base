from ..schema import object_schema
from ..telemetry import HttpTelemetry, fields, zipkin

class Config:
    metadata = {"name": "observable-zipkin", "description": "Native Zipkin v2 traces", "category": "observable"}
    validation_schema = object_schema(fields("http://localhost:9411/api/v2/spans"))

class Plugin(HttpTelemetry):
    signals = ("traces",)
    async def export(self, batch):
        await self.send(self.config["endpoint"], zipkin(batch, self.config))
