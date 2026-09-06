using AnyVali;
using BSB.Interfaces;
using System.Text.Json.Nodes;

namespace BSB.Base;

public sealed class ConsoleLoggingConfig
{
    public string Level { get; init; } = "info";
    public bool PrettyPrint { get; init; }
    public string[] Redact { get; init; } = [];
    public Dictionary<string, object?> Base { get; init; } = new();
    public string? FilePath { get; init; }
    public long MaxBytes { get; init; } = 10485760;
    public int MaxFiles { get; init; } = 7;
    public string Interval { get; init; } = "daily";
    public bool Compress { get; init; } = true;
}

/// <summary>Native console/file equivalent for the Pino and Winston plugin identities.</summary>
public abstract class ConsoleLogging(ServiceConstructorArgs<ConsoleLoggingConfig> args) : StructuredLogging<ConsoleLoggingConfig>(args)
{
    public static Schema ConfigSchema => V.Object(new() {
        ["level"] = V.Enum(["trace", "debug", "info", "warn", "error", "fatal"]).Default("info"),
        ["prettyPrint"] = V.Bool().Default(false), ["redact"] = V.Array(V.String().MinLength(1)).Default(new List<object?>()),
        ["base"] = V.Record(V.Unknown()).Default(new Dictionary<string, object?>()), ["filePath"] = V.Optional(V.String().MinLength(1)),
        ["maxBytes"] = V.Int64().Min(1).Default(10485760L), ["maxFiles"] = V.Int32().Min(0).Default(7),
        ["interval"] = V.Enum(["none", "hourly", "daily"]).Default("daily"), ["compress"] = V.Bool().Default(true),
    });
    private RotatingLogFile? _file;
    protected virtual bool NumericLevel => false;
    public override Task Init(IObservable obs)
    {
        if (Config.FilePath is not null) _file = new RotatingLogFile(Path.GetFullPath(Config.FilePath, Cwd), Config.MaxBytes, Config.MaxFiles, Config.Interval, Config.Compress);
        return Task.CompletedTask;
    }
    protected override void Write(JsonObject entry)
    {
        var level = entry["level"]!.GetValue<string>();
        if (Severity(level) < Severity(Config.Level)) return;
        foreach (var (key, value) in Config.Base)
            if (!entry.ContainsKey(key)) entry[key] = System.Text.Json.JsonSerializer.SerializeToNode(value);
        Redact(entry, Config.Redact);
        if (NumericLevel)
        {
            entry["level"] = (Severity(level) + 1) * 10;
            entry["msg"] = entry["message"]?.DeepClone(); entry.Remove("message");
        }
        var json = entry.ToJsonString();
        if (Config.PrettyPrint)
            Console.WriteLine($"{entry["timestamp"]} {level} [{entry["plugin"]}] {entry[NumericLevel ? "msg" : "message"]} {entry["meta"]?.ToJsonString()}");
        else Console.WriteLine(json);
        _file?.Write(json);
    }
    public override ValueTask DisposeAsync() { _file?.Dispose(); return ValueTask.CompletedTask; }
}
