using AnyVali;
using BSB.Base;
using BSB.Interfaces;
using System.Text.Json.Nodes;

namespace BSB.Plugins.Axiom;
public class AxiomConfig : TelemetryConfig
{
    public string Token { get; init; } = "";
    public string Dataset { get; init; } = "bsb-logs";
    public string? OrgId { get; init; }
    public bool AllowInsecureHttp { get; init; }
}
public class Plugin(ServiceConstructorArgs<AxiomConfig> args) : HttpTelemetry<AxiomConfig>(args)
{
    public static BSBPluginMetadata Metadata => new() { Name = "observable-axiom", Description = "Native Axiom event ingestion and OTLP traces", Category = PluginType.Observable };
    public static Schema ConfigSchema
    {
        get
        {
            var fields = TelemetryConfig.Fields("https://api.axiom.co");
            fields["token"] = V.String().MinLength(1).Describe("Axiom ingestion token", new DescribeOptions { Sensitive = true });
            fields["dataset"] = V.String().MinLength(1).Default("bsb-logs");
            fields["orgId"] = V.Optional(V.String().MinLength(1));
            fields["allowInsecureHttp"] = V.Bool().Default(false);
            return V.Object(fields);
        }
    }
    public override Task Init(IObservable obs)
    {
        if (!Config.AllowInsecureHttp && new Uri(Config.Endpoint).Scheme != "https") throw new ArgumentException("Axiom token requires HTTPS unless allowInsecureHttp is explicit");
        return base.Init(obs);
    }
    protected override async Task Export(IReadOnlyList<JsonObject> batch, CancellationToken token)
    {
        var headers = new Dictionary<string, string>(Config.Headers, StringComparer.OrdinalIgnoreCase) {
            ["Authorization"] = "Bearer " + Config.Token, ["X-Axiom-Dataset"] = Config.Dataset };
        if (Config.OrgId is not null) headers["X-Axiom-Org-Id"] = Config.OrgId;
        var events = batch.Where(x => x["signal"]!.GetValue<string>() != "traces").Select(x => {
            var value = x.DeepClone().AsObject(); value["_time"] = value["timestamp"]?.DeepClone();
            value["service"] = Config.ServiceName; return value;
        }).ToArray();
        if (events.Length > 0) await Http.Post(Endpoint("v1/datasets/" + Uri.EscapeDataString(Config.Dataset) + "/ingest"), events, headers, token);
        var spans = batch.Where(x => x["signal"]!.GetValue<string>() == "traces").ToArray();
        if (spans.Length > 0) await Http.Post(Endpoint("v1/traces"), TelemetryFormats.OtlpTraces(spans, Config.ServiceName, Config.ServiceVersion, Config.ResourceAttributes), headers, token);
    }
}
