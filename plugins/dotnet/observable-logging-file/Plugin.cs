using AnyVali;
using BSB.Base;
using BSB.Interfaces;
using System.Text.Json.Nodes;

namespace BSB.Plugins.FileLogging;

public class LoggingConfig
{
    public string Path { get; init; } = "logs/application.log";
    public string Level { get; init; } = "info";
    public long MaxBytes { get; init; } = 10485760;
    public int MaxFiles { get; init; } = 7;
    public string Interval { get; init; } = "daily";
    public bool Compress { get; init; } = true;
    public string[] Redact { get; init; } = [];
    public bool PrettyPrint { get; init; }
}
public class Plugin(ServiceConstructorArgs<LoggingConfig> args) : StructuredLogging<LoggingConfig>(args)
{
    public static BSBPluginMetadata Metadata => new() { Name = "observable-logging-file", Description = "Native structured file logging with size/time rotation", Category = PluginType.Observable };
    public static Schema ConfigSchema => V.Object(new() {
        ["path"] = V.String().MinLength(1).Default("logs/application.log"),
        ["level"] = V.Enum(["trace", "debug", "info", "warn", "error", "fatal"]).Default("info"),
        ["maxBytes"] = V.Int64().Min(1).Default(10485760L), ["maxFiles"] = V.Int32().Min(0).Default(7),
        ["interval"] = V.Enum(["none", "hourly", "daily"]).Default("daily"), ["compress"] = V.Bool().Default(true),
        ["redact"] = V.Array(V.String().MinLength(1)).Default(new List<object?>()), ["prettyPrint"] = V.Bool().Default(false),
    });
    private RotatingLogFile? _file;
    public override Task Init(IObservable obs)
    {
        _file = new RotatingLogFile(System.IO.Path.GetFullPath(Config.Path, Cwd), Config.MaxBytes, Config.MaxFiles, Config.Interval, Config.Compress);
        return Task.CompletedTask;
    }
    protected override void Write(JsonObject entry)
    {
        if (Severity(entry["level"]!.GetValue<string>()) < Severity(Config.Level)) return;
        Redact(entry, Config.Redact);
        Interpolate(entry);
        (_file ?? throw new InvalidOperationException("File logging not initialized")).Write(entry.ToJsonString(new() { WriteIndented = Config.PrettyPrint }));
    }
    public override ValueTask DisposeAsync() { _file?.Dispose(); return ValueTask.CompletedTask; }
}
