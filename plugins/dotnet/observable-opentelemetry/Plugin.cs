using AnyVali;
using BSB.Base;
using BSB.Interfaces;
using System.Text.Json.Nodes;

namespace BSB.Plugins.OpenTelemetry;
public class Plugin(ServiceConstructorArgs<TelemetryConfig> args) : HttpTelemetry<TelemetryConfig>(args)
{
    public static BSBPluginMetadata Metadata => new() { Name = "observable-opentelemetry", Description = "Native OTLP HTTP JSON logs, metrics and traces", Category = PluginType.Observable };
    public static Schema ConfigSchema => V.Object(TelemetryConfig.Fields("http://localhost:4318"));
    protected override async Task Export(IReadOnlyList<JsonObject> batch, CancellationToken token)
    {
        foreach (var signal in batch.GroupBy(x => x["signal"]!.GetValue<string>()))
        {
            var body = signal.Key switch {
                "logs" => TelemetryFormats.OtlpLogs(signal, Config.ServiceName, Config.ServiceVersion, Config.ResourceAttributes),
                "metrics" => TelemetryFormats.OtlpMetrics(signal, Config.ServiceName, Config.ServiceVersion, Config.ResourceAttributes),
                "traces" => TelemetryFormats.OtlpTraces(signal, Config.ServiceName, Config.ServiceVersion, Config.ResourceAttributes),
                _ => throw new InvalidOperationException("Unknown telemetry signal"),
            };
            await Http.Post(Endpoint("v1/" + signal.Key), body, Config.Headers, token);
        }
    }
}
