using AnyVali;
using BSB.Interfaces;
using System.Globalization;
using System.Text.Json.Nodes;

namespace BSB.Base;

public class TelemetryConfig
{
    public string Endpoint { get; init; } = "http://localhost:4318";
    public string ServiceName { get; init; } = "bsb-service";
    public string? ServiceVersion { get; init; }
    public Dictionary<string, string> Headers { get; init; } = new();
    public Dictionary<string, string> ResourceAttributes { get; init; } = new();
    public int FlushIntervalMs { get; init; } = 5000;
    public int MaxBatchSize { get; init; } = 512;
    public double SamplingRate { get; init; } = 1;
    public bool Logs { get; init; } = true;
    public bool Metrics { get; init; } = true;
    public bool Traces { get; init; } = true;
    public static Dictionary<string, Schema> Fields(string endpoint) => new() {
        ["endpoint"] = V.String().Format("url").Default(endpoint),
        ["serviceName"] = V.String().MinLength(1).Default("bsb-service"), ["serviceVersion"] = V.Optional(V.String()),
        ["headers"] = V.Record(V.String()).Default(new Dictionary<string, object?>()).Describe("HTTP headers", new DescribeOptions { Sensitive = true }),
        ["resourceAttributes"] = V.Record(V.String()).Default(new Dictionary<string, object?>()),
        ["flushIntervalMs"] = V.Int32().Min(100).Max(60000).Default(5000), ["maxBatchSize"] = V.Int32().Min(1).Max(4096).Default(512),
        ["samplingRate"] = V.Number().Min(0).Max(1).Default(1.0),
        ["logs"] = V.Bool().Default(true), ["metrics"] = V.Bool().Default(true), ["traces"] = V.Bool().Default(true),
    };
}

public abstract class HttpTelemetry<TConfig>(ServiceConstructorArgs<TConfig> args) : BufferedTelemetry<TConfig>(args) where TConfig : TelemetryConfig
{
    protected TelemetryHttp Http { get; private set; } = null!;
    protected override int FlushIntervalMs => Config.FlushIntervalMs;
    protected override int MaxBatchSize => Config.MaxBatchSize;
    protected override bool LogsEnabled => Config.Logs;
    protected override bool MetricsEnabled => Config.Metrics;
    protected override bool TracesEnabled => Config.Traces;
    protected virtual HttpMessageHandler? CreateHandler() => null;
    public override Task Init(IObservable obs)
    {
        var uri = new Uri(Config.Endpoint);
        if (uri.Scheme is not ("http" or "https") || uri.UserInfo.Length > 0 || uri.Query.Length > 0 || uri.Fragment.Length > 0)
            throw new ArgumentException("Invalid telemetry endpoint");
        Http = new TelemetryHttp(CreateHandler());
        return Task.CompletedTask;
    }
    public override void SpanEnded(CompletedSpan span)
    {
        if (!span.Trace.IsValid || Config.SamplingRate <= 0) return;
        var fraction = uint.Parse(span.Trace.TraceId[..8], NumberStyles.HexNumber, CultureInfo.InvariantCulture) / ((double)uint.MaxValue + 1);
        if (fraction < Config.SamplingRate) base.SpanEnded(span);
    }
    public override async ValueTask DisposeAsync()
    {
        try { await base.DisposeAsync(); } finally { Http?.Dispose(); }
    }
    protected Uri Endpoint(string path) => new(Config.Endpoint.TrimEnd('/') + "/" + path.TrimStart('/'));
}
