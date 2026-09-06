using BSB.Interfaces;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace BSB.Base;

/// <summary>Common structured entry format for native logging exporters.</summary>
public abstract class StructuredLogging<TConfig>(ServiceConstructorArgs<TConfig> args) : BSBObservable<TConfig>(args)
{
    protected abstract void Write(JsonObject entry);
    private void Log(string level, DTrace trace, string plugin, string message, LogMeta? meta, Exception? error = null)
    {
        var entry = new JsonObject {
            ["timestamp"] = DateTimeOffset.UtcNow.ToString("O"), ["level"] = level, ["plugin"] = plugin,
            ["message"] = message, ["traceId"] = trace.TraceId, ["spanId"] = trace.SpanId,
            ["meta"] = meta is null ? null : JsonSerializer.SerializeToNode(meta),
        };
        if (error is not null) entry["error"] = new JsonObject { ["type"] = error.GetType().FullName, ["message"] = error.Message, ["stack"] = error.StackTrace };
        Write(entry);
    }
    public override void Debug(DTrace trace, string pluginName, string message, LogMeta? meta = null) => Log("debug", trace, pluginName, message, meta);
    public override void Info(DTrace trace, string pluginName, string message, LogMeta? meta = null) => Log("info", trace, pluginName, message, meta);
    public override void Warn(DTrace trace, string pluginName, string message, LogMeta? meta = null) => Log("warn", trace, pluginName, message, meta);
    public override void Error(DTrace trace, string pluginName, string message, LogMeta? meta = null) => Log("error", trace, pluginName, message, meta);
    public override void Error(DTrace trace, string pluginName, Exception error, string? message = null, LogMeta? meta = null) => Log("error", trace, pluginName, message ?? error.Message, meta, error);

    public static int Severity(string level) => level switch { "trace" => 0, "debug" => 1, "info" => 2, "warn" => 3, "error" => 4, "fatal" => 5, _ => throw new ArgumentException("Unknown log level") };
    public static void Redact(JsonObject entry, IEnumerable<string> paths)
    {
        foreach (var path in paths) Visit(entry, path.Split('.'), 0);
        static void Visit(JsonNode? node, string[] parts, int index)
        {
            if (index >= parts.Length) return;
            if (node is JsonArray array)
            {
                for (var i = 0; i < array.Count; i++)
                    if (parts[index] == "*" || parts[index] == i.ToString(System.Globalization.CultureInfo.InvariantCulture))
                        if (index == parts.Length - 1) array[i] = "[REDACTED]"; else Visit(array[i], parts, index + 1);
                return;
            }
            if (node is not JsonObject obj) return;
            foreach (var key in obj.Select(x => x.Key).Where(x => parts[index] == "*" || x == parts[index]).ToArray())
                if (index == parts.Length - 1) obj[key] = "[REDACTED]"; else Visit(obj[key], parts, index + 1);
        }
    }
}

/// <summary>Serializes writes, rotates by size/time and retains only this writer's archives.</summary>
public sealed class RotatingLogFile : IDisposable
{
    private readonly string _path;
    private readonly long _maxBytes;
    private readonly int _maxFiles;
    private readonly bool _compress;
    private readonly TimeSpan? _interval;
    private readonly object _gate = new();
    private FileStream? _file;
    private DateTime _opened;
    private bool _disposed;
    public RotatingLogFile(string path, long maxBytes, int maxFiles, string interval, bool compress)
    {
        if (maxBytes <= 0 || maxFiles < 0) throw new ArgumentOutOfRangeException(nameof(maxBytes));
        _path = Path.GetFullPath(path); _maxBytes = maxBytes; _maxFiles = maxFiles; _compress = compress;
        _interval = interval switch { "daily" => TimeSpan.FromDays(1), "hourly" => TimeSpan.FromHours(1), "none" => null, _ => throw new ArgumentException("Invalid log rotation interval") };
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
    }
    public void Write(string line)
    {
        var bytes = Encoding.UTF8.GetBytes(line + "\n");
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            Open();
            if (_file!.Length > 0 && (_file.Length + bytes.Length > _maxBytes || (_interval is TimeSpan interval && DateTime.UtcNow - _opened >= interval)))
            {
                _file.Dispose(); _file = null;
                var archive = _path + ".bsb-" + DateTime.UtcNow.ToString("yyyyMMddTHHmmssfffffffZ") + "-" + Guid.NewGuid().ToString("N");
                File.Move(_path, archive);
                if (_compress)
                {
                    try
                    {
                        using (var input = File.OpenRead(archive))
                        using (var output = File.Create(archive + ".gz"))
                        using (var gzip = new GZipStream(output, CompressionLevel.Fastest)) input.CopyTo(gzip);
                        File.Delete(archive);
                    }
                    catch { File.Delete(archive + ".gz"); throw; } // Keep the uncompressed archive on failure.
                }
                if (_maxFiles > 0)
                    foreach (var old in Directory.EnumerateFiles(Path.GetDirectoryName(_path)!, Path.GetFileName(_path) + ".bsb-*")
                        .OrderByDescending(x => x, StringComparer.Ordinal).Skip(_maxFiles)) File.Delete(old);
                Open();
            }
            _file!.Write(bytes); _file.Flush();
        }
    }
    private void Open()
    {
        if (_file is not null) return;
        _opened = File.Exists(_path) ? File.GetLastWriteTimeUtc(_path) : DateTime.UtcNow;
        _file = new FileStream(_path, FileMode.Append, FileAccess.Write, FileShare.Read);
    }
    public void Dispose() { lock (_gate) { if (_disposed) return; _disposed = true; _file?.Dispose(); _file = null; } }
}
