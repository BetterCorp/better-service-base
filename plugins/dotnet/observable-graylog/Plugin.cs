using AnyVali;
using BSB.Base;
using BSB.Interfaces;
using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace BSB.Plugins.Graylog;
public sealed class GraylogConfig : NetworkLoggingConfig
{
    public string Facility { get; init; } = "bsb";
    public bool Compress { get; init; } = true;
    public string? HttpEndpoint { get; init; }
    public Dictionary<string, string> Headers { get; init; } = new();
    public Dictionary<string, object?> AdditionalFields { get; init; } = new();
}
public class Plugin(ServiceConstructorArgs<GraylogConfig> args) : NetworkLogging<GraylogConfig>(args)
{
    private readonly TelemetryHttp _http = new();
    public static BSBPluginMetadata Metadata => new() { Name = "observable-graylog", Description = "Native GELF UDP/TCP/TLS/HTTP logging", Category = PluginType.Observable };
    public static Schema ConfigSchema
    {
        get
        {
            var fields = NetworkLoggingConfig.Fields(12201, http: true);
            fields["facility"] = V.String().Default("bsb"); fields["compress"] = V.Bool().Default(true);
            fields["httpEndpoint"] = V.Optional(V.String().Format("url"));
            fields["headers"] = V.Record(V.String()).Default(new Dictionary<string, object?>()).Describe("GELF HTTP headers", new DescribeOptions { Sensitive = true });
            fields["additionalFields"] = V.Record(V.Unknown()).Default(new Dictionary<string, object?>());
            return V.Object(fields);
        }
    }
    public static JsonObject Format(JsonObject entry, GraylogConfig config)
    {
        var message = new JsonObject { ["version"] = "1.1", ["host"] = Environment.MachineName,
            ["short_message"] = entry["message"]?.DeepClone(), ["full_message"] = entry.ToJsonString(),
            ["timestamp"] = DateTimeOffset.Parse(entry["timestamp"]!.GetValue<string>(), CultureInfo.InvariantCulture).ToUnixTimeMilliseconds() / 1000d,
            ["level"] = SyslogSeverity(entry["level"]!.GetValue<string>()), ["_facility"] = config.Facility,
            ["_plugin"] = entry["plugin"]?.DeepClone(), ["_trace_id"] = entry["traceId"]?.DeepClone(), ["_span_id"] = entry["spanId"]?.DeepClone() };
        foreach (var (key, value) in config.AdditionalFields)
        {
            var name = "_" + key.TrimStart('_');
            if (name == "_id" || message.ContainsKey(name) || !System.Text.RegularExpressions.Regex.IsMatch(name, "^_[A-Za-z0-9_.-]+$")) continue;
            var node = JsonSerializer.SerializeToNode(value);
            message[name] = node?.GetValueKind() is JsonValueKind.Number or JsonValueKind.String ? node : JsonValue.Create(node?.ToJsonString() ?? "null");
        }
        return message;
    }
    public static byte[][] DatagramChunks(JsonObject message, bool compress)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(message);
        if (compress)
        {
            using var output = new MemoryStream();
            using (var gzip = new GZipStream(output, CompressionLevel.Fastest, leaveOpen: true)) gzip.Write(bytes);
            bytes = output.ToArray();
        }
        if (bytes.Length <= 1200) return [bytes];
        const int size = 1188;
        var count = (bytes.Length + size - 1) / size;
        if (count > 128) throw new IOException("GELF message exceeds 128 datagram chunks");
        var id = RandomNumberGenerator.GetBytes(8);
        return Enumerable.Range(0, count).Select(i => new byte[] { 0x1e, 0x0f }.Concat(id).Concat(new[] { (byte)i, (byte)count })
            .Concat(bytes.Skip(i * size).Take(size)).ToArray()).ToArray();
    }
    protected override async Task Export(IReadOnlyList<JsonObject> batch, CancellationToken token)
    {
        foreach (var entry in batch)
        {
            var message = Format(entry, Config);
            if (Config.Protocol == "http")
                await _http.Post(new Uri(Config.HttpEndpoint ?? new UriBuilder("http", Config.Host, Config.Port, "gelf").Uri.ToString()), message, Config.Headers, token);
            else if (Config.Protocol == "udp")
                foreach (var bytes in DatagramChunks(message, Config.Compress)) await Send(bytes, token);
            else
            {
                byte[] frame = [.. JsonSerializer.SerializeToUtf8Bytes(message), (byte)0];
                await Send(frame, token);
            }
        }
    }
    public override async ValueTask DisposeAsync() { try { await base.DisposeAsync(); } finally { _http.Dispose(); } }
}
