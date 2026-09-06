using BSB.Interfaces;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace BSB.Base;

/// <summary>OTLP/HTTP JSON and Zipkin v2 encodings preserving BSB's original trace/span IDs.</summary>
public static class TelemetryFormats
{
    public static string Nanoseconds(DateTimeOffset time) => ((time.UtcTicks - DateTimeOffset.UnixEpoch.Ticks) * 100).ToString(CultureInfo.InvariantCulture);
    private static object Value(JsonNode? node)
    {
        if (node is JsonObject obj) return new { kvlistValue = new { values = Attributes(obj) } };
        if (node is JsonArray array) return new { arrayValue = new { values = array.Select(Value).ToArray() } };
        if (node is null) return new { };
        var element = JsonSerializer.SerializeToElement(node);
        return element.ValueKind switch {
            JsonValueKind.String => new { stringValue = element.GetString() },
            JsonValueKind.True or JsonValueKind.False => new { boolValue = element.GetBoolean() },
            JsonValueKind.Number when element.TryGetInt64(out var integer) => new { intValue = integer.ToString(CultureInfo.InvariantCulture) },
            JsonValueKind.Number when element.TryGetUInt64(out _) => new { stringValue = element.GetRawText() },
            JsonValueKind.Number => new { doubleValue = element.GetDouble() },
            _ => (object)new { },
        };
    }
    private static object[] Attributes(JsonObject values) => values.Select(x => (object)new { key = x.Key, value = Value(x.Value) }).ToArray();
    private static JsonObject Resource(string service, string? version, IReadOnlyDictionary<string, string>? additional, ResourceContext? context = null)
    {
        var result = JsonSerializer.SerializeToNode(context?.ToAttributes() ?? new Dictionary<string, string>())!.AsObject();
        result["service.name"] = service;
        if (version is not null) result["service.version"] = version;
        if (additional is not null) foreach (var (key, value) in additional) result[key] = value;
        return result;
    }
    public static object OtlpTraces(IEnumerable<JsonObject> entries, string service, string? version, IReadOnlyDictionary<string, string>? resourceAttributes) => new {
        resourceSpans = entries.Select(entry => {
            var span = entry.Deserialize<CompletedSpan>(EventSchemaExport.JsonOptions)!;
            var attributes = JsonSerializer.SerializeToNode(span.Attributes)!.AsObject();
            attributes["bsb.plugin"] = span.PluginName;
            return new {
                resource = new { attributes = Attributes(Resource(service, version, resourceAttributes, span.Resource)) },
                scopeSpans = new[] { new {
                    scope = new { name = "bsb", version = typeof(MainBase).Assembly.GetName().Version?.ToString() },
                    spans = new[] { new { traceId = span.Trace.TraceId, spanId = span.Trace.SpanId, parentSpanId = span.ParentSpanId,
                        name = span.Name, kind = 1, startTimeUnixNano = Nanoseconds(span.StartedAt), endTimeUnixNano = Nanoseconds(span.StartedAt + span.Duration),
                        attributes = Attributes(attributes), status = new { code = span.Error is null ? 0 : 2, message = span.Error } } },
                } },
            };
        }).ToArray(),
    };
    public static object OtlpLogs(IEnumerable<JsonObject> entries, string service, string? version, IReadOnlyDictionary<string, string>? resourceAttributes) => new {
        resourceLogs = new[] { new {
            resource = new { attributes = Attributes(Resource(service, version, resourceAttributes)) },
            scopeLogs = new[] { new {
                scope = new { name = "bsb" },
                logRecords = entries.Select(entry => {
                    var attributes = entry["meta"]?.DeepClone() as JsonObject ?? new();
                    attributes["bsb.plugin"] = entry["plugin"]?.DeepClone();
                    if (entry["error"] is not null) attributes["exception"] = entry["error"]!.DeepClone();
                    var level = entry["level"]!.GetValue<string>();
                    return new { timeUnixNano = Nanoseconds(DateTimeOffset.Parse(entry["timestamp"]!.GetValue<string>(), CultureInfo.InvariantCulture)),
                        severityText = level.ToUpperInvariant(), severityNumber = StructuredLogging<object>.Severity(level) * 4 + 1,
                        body = Value(entry["message"]), traceId = entry["traceId"]?.GetValue<string>(), spanId = entry["spanId"]?.GetValue<string>(), attributes = Attributes(attributes) };
                }).ToArray(),
            } },
        } },
    };
    public static object OtlpMetrics(IEnumerable<JsonObject> entries, string service, string? version, IReadOnlyDictionary<string, string>? resourceAttributes)
    {
        var metrics = new List<(string Plugin, JsonObject Value)>();
        foreach (var metric in entries.GroupBy(x => (Name: x["name"]!.GetValue<string>(), Plugin: x["plugin"]!.GetValue<string>(), Kind: x["kind"]!.GetValue<string>())))
        {
            var points = new JsonArray();
            foreach (var series in metric.GroupBy(x => x["labels"]!.ToJsonString()))
            {
                var last = series.Last();
                var labels = last["labels"]!.DeepClone().AsObject(); labels["bsb.plugin"] = metric.Key.Plugin;
                var point = new JsonObject { ["attributes"] = JsonSerializer.SerializeToNode(Attributes(labels)),
                    ["timeUnixNano"] = Nanoseconds(DateTimeOffset.Parse(last["timestamp"]!.GetValue<string>(), CultureInfo.InvariantCulture)) };
                if (metric.Key.Kind != "gauge") point["startTimeUnixNano"] = Nanoseconds(DateTimeOffset.Parse(last["started"]!.GetValue<string>(), CultureInfo.InvariantCulture));
                if (metric.Key.Kind == "histogram")
                {
                    point["count"] = last["count"]!.ToJsonString(); point["sum"] = last["sum"]!.DeepClone();
                    point["min"] = last["min"]!.DeepClone(); point["max"] = last["max"]!.DeepClone();
                    point["bucketCounts"] = new JsonArray(JsonValue.Create(last["count"]!.ToJsonString())); point["explicitBounds"] = new JsonArray();
                }
                else point["asDouble"] = last["value"]!.DeepClone();
                points.Add(point);
            }
            var data = new JsonObject { ["dataPoints"] = points };
            if (metric.Key.Kind != "gauge") data["aggregationTemporality"] = 2;
            if (metric.Key.Kind == "counter") data["isMonotonic"] = true;
            var first = metric.First();
            metrics.Add((metric.Key.Plugin, new JsonObject { ["name"] = metric.Key.Name, ["description"] = first["description"]!.DeepClone(), ["unit"] = first["unit"]!.DeepClone(),
                [metric.Key.Kind == "counter" ? "sum" : metric.Key.Kind] = data }));
        }
        return new { resourceMetrics = new[] { new {
            resource = new { attributes = Attributes(Resource(service, version, resourceAttributes)) },
            scopeMetrics = metrics.GroupBy(x => x.Plugin).Select(group => new {
                scope = new { name = "bsb." + group.Key }, metrics = group.Select(x => x.Value).ToArray() }).ToArray(),
        } } };
    }
    public static object Zipkin(IEnumerable<JsonObject> entries, string service) => entries.Select(entry => {
        var span = entry.Deserialize<CompletedSpan>(EventSchemaExport.JsonOptions)!;
        var tags = span.Attributes.ToDictionary(x => x.Key, x => x.Value is JsonElement json ? json.ToString() : Convert.ToString(x.Value, CultureInfo.InvariantCulture) ?? "");
        tags["bsb.plugin"] = span.PluginName;
        if (span.Error is not null) tags["error"] = span.Error;
        return new { traceId = span.Trace.TraceId, id = span.Trace.SpanId, parentId = span.ParentSpanId, name = span.Name,
            timestamp = (span.StartedAt.UtcTicks - DateTimeOffset.UnixEpoch.Ticks) / 10, duration = Math.Max(1, span.Duration.Ticks / 10),
            localEndpoint = new { serviceName = service }, tags };
    }).ToArray();
}
