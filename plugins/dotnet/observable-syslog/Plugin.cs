using AnyVali;
using BSB.Base;
using BSB.Interfaces;
using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;

namespace BSB.Plugins.Syslog;
public sealed class SyslogConfig : NetworkLoggingConfig
{
    public int Facility { get; init; } = 16;
    public string Hostname { get; init; } = Environment.MachineName;
    public string AppName { get; init; } = "bsb-app";
    public string Rfc { get; init; } = "5424";
    public string Framing { get; init; } = "newline";
}
public class Plugin(ServiceConstructorArgs<SyslogConfig> args) : NetworkLogging<SyslogConfig>(args)
{
    public static BSBPluginMetadata Metadata => new() { Name = "observable-syslog", Description = "Native UDP/TCP/TLS syslog forwarding", Category = PluginType.Observable };
    public static Schema ConfigSchema
    {
        get
        {
            var fields = NetworkLoggingConfig.Fields(514);
            fields["facility"] = V.Int32().Min(0).Max(23).Default(16);
            fields["hostname"] = V.String().MinLength(1).MaxLength(255).Default(Environment.MachineName);
            fields["appName"] = V.String().MinLength(1).MaxLength(48).Default("bsb-app");
            fields["rfc"] = V.Enum(["3164", "5424"]).Default("5424");
            fields["framing"] = V.Enum(["newline", "octet-counting"]).Default("newline");
            return V.Object(fields);
        }
    }
    public static byte[] Format(JsonObject entry, SyslogConfig config)
    {
        static string Field(string value) => new(value.Select(c => c is >= '!' and <= '~' ? c : '_').ToArray());
        var priority = config.Facility * 8 + SyslogSeverity(entry["level"]!.GetValue<string>());
        var timestamp = DateTimeOffset.Parse(entry["timestamp"]!.GetValue<string>(), CultureInfo.InvariantCulture).UtcDateTime;
        var prefix = config.Rfc == "5424"
            ? $"<{priority}>1 {timestamp:yyyy-MM-ddTHH:mm:ss.fffZ} {Field(config.Hostname)} {Field(config.AppName)} {Environment.ProcessId} - - "
            : $"<{priority}>{timestamp.ToString("MMM", CultureInfo.InvariantCulture)} {timestamp.Day.ToString(CultureInfo.InvariantCulture).PadLeft(2)} {timestamp:HH:mm:ss} {Field(config.Hostname)} {Field(config.AppName)}[{Environment.ProcessId}]: ";
        var bytes = Encoding.UTF8.GetBytes(prefix + entry.ToJsonString());
        if (config.Protocol == "udp") return bytes;
        if (config.Framing == "octet-counting")
            return [.. Encoding.ASCII.GetBytes(bytes.Length.ToString(CultureInfo.InvariantCulture) + " "), .. bytes];
        return [.. bytes, (byte)'\n'];
    }
    protected override async Task Export(IReadOnlyList<JsonObject> batch, CancellationToken token)
    {
        foreach (var entry in batch) await Send(Format(entry, Config), token);
    }
}
