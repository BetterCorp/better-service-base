using AnyVali;
using BSB.Base;
using BSB.Interfaces;
using System.Text.Json.Nodes;

namespace BSB.Plugins.Zipkin;
public class Plugin(ServiceConstructorArgs<TelemetryConfig> args) : HttpTelemetry<TelemetryConfig>(args)
{
    public static BSBPluginMetadata Metadata => new() { Name = "observable-zipkin", Description = "Native Zipkin v2 trace export", Category = PluginType.Observable };
    public static Schema ConfigSchema {
        get {
            var fields = TelemetryConfig.Fields("http://localhost:9411/api/v2/spans");
            fields.Remove("logs"); fields.Remove("metrics");
            return V.Object(fields);
        }
    }
    protected override bool LogsEnabled => false;
    protected override bool MetricsEnabled => false;
    protected override Task Export(IReadOnlyList<JsonObject> batch, CancellationToken token) =>
        Http.Post(new Uri(Config.Endpoint), TelemetryFormats.Zipkin(batch, Config.ServiceName), Config.Headers, token);
}
