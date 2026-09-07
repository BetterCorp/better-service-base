from urllib.parse import quote

from bsb.http import origin
from bsb.schema import av, object_schema
from bsb.telemetry import HttpTelemetry, fields, otlp

class Config:
    metadata = {"name": "observable-axiom", "description": "Native Axiom event ingestion and OTLP traces", "category": "observable"}
    validation_schema = object_schema({**fields("https://api.axiom.co"), "token": av.string().min_length(1).describe("Axiom ingestion token", sensitive=True),
        "dataset": av.string().min_length(1).default("bsb-logs"), "orgId": av.optional(av.string().min_length(1)),
        "allowInsecureHttp": av.bool_().default(False)})

class Plugin(HttpTelemetry):
    async def init(self, trace):
        origin(self.config["endpoint"], allow_http=self.config["allowInsecureHttp"])

    async def export(self, batch):
        headers = {**self.config["headers"], "Authorization": "Bearer " + self.config["token"], "X-Axiom-Dataset": self.config["dataset"]}
        if self.config.get("orgId"):
            headers["X-Axiom-Org-Id"] = self.config["orgId"]
        entries = [{**entry, "_time": entry.get("timestamp") or entry.get("timestampNs"), "service": self.config["serviceName"]} for entry in batch if entry["signal"] != "traces"]
        if entries:
            await self.send(self.endpoint("v1/datasets/" + quote(self.config["dataset"], safe="") + "/ingest"), entries, headers)
        spans = [entry for entry in batch if entry["signal"] == "traces"]
        if spans:
            await self.send(self.endpoint("v1/traces"), otlp("traces", spans, self.config), headers)
