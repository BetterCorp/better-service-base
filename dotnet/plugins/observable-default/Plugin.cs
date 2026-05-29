using BSB.Base;
using BSB.Interfaces;

public class ObservableDefaultConfig
{
    public bool ShowDebug { get; set; } = true;
    public bool ShowTraceId { get; set; } = true;
}

/// <summary>
/// Default observable plugin. Outputs structured logs to the console with
/// color-coded severity levels and optional trace ID prefixes.
/// </summary>
public class Plugin : BSBObservable<ObservableDefaultConfig>
{
    public Plugin(ServiceConstructorArgs<ObservableDefaultConfig> args) : base(args) { }

    public override void Debug(DTrace trace, string pluginName, string message, LogMeta? meta = null)
    {
        if (!Config.ShowDebug) return;
        WriteLog("DBG", ConsoleColor.Gray, trace, pluginName, message, meta);
    }

    public override void Info(DTrace trace, string pluginName, string message, LogMeta? meta = null)
    {
        WriteLog("INF", null, trace, pluginName, message, meta);
    }

    public override void Warn(DTrace trace, string pluginName, string message, LogMeta? meta = null)
    {
        WriteLog("WRN", ConsoleColor.Yellow, trace, pluginName, message, meta);
    }

    public override void Error(DTrace trace, string pluginName, string message, LogMeta? meta = null)
    {
        WriteLog("ERR", ConsoleColor.Red, trace, pluginName, message, meta);
    }

    public override void Error(DTrace trace, string pluginName, Exception error, string? message = null, LogMeta? meta = null)
    {
        WriteLog("ERR", ConsoleColor.Red, trace, pluginName, message ?? error.Message, meta);
        if (error.StackTrace is not null)
            Console.Error.WriteLine(error.StackTrace);
    }

    private void WriteLog(string level, ConsoleColor? color, DTrace trace,
        string pluginName, string message, LogMeta? meta)
    {
        var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.fff");
        var traceStr = Config.ShowTraceId ? $" [{trace.TraceId[..8]}]" : "";
        var interpolated = InterpolateMessage(message, meta);
        var line = $"{timestamp} {level}{traceStr} [{pluginName}] {interpolated}";

        if (color.HasValue)
        {
            var prev = Console.ForegroundColor;
            Console.ForegroundColor = color.Value;
            Console.WriteLine(line);
            Console.ForegroundColor = prev;
        }
        else
        {
            Console.WriteLine(line);
        }
    }

    private static string InterpolateMessage(string message, LogMeta? meta)
    {
        if (meta is null or { Count: 0 }) return message;
        var result = message;
        foreach (var (key, value) in meta)
            result = result.Replace($"{{{key}}}", value?.ToString() ?? "null");
        return result;
    }
}
