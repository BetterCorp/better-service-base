using BSB.Interfaces;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;

namespace BSB.Base;

/// <summary>A bounded telemetry queue shared by native remote exporters.</summary>
public abstract class BufferedTelemetry<TConfig>(ServiceConstructorArgs<TConfig> args) : StructuredLogging<TConfig>(args)
{
    private readonly Channel<JsonObject> _queue = Channel.CreateBounded<JsonObject>(4096);
    private readonly CancellationTokenSource _flush = new(), _shutdown = new();
    private readonly ConcurrentDictionary<(string Plugin, string Name), (string Kind, string Description, string Unit)> _instruments = new();
    private readonly ConcurrentDictionary<string, MetricState> _series = new();
    private sealed class MetricState
    {
        public double Value, Sum, Min = double.PositiveInfinity, Max = double.NegativeInfinity;
        public long Count;
        public DateTimeOffset Started = DateTimeOffset.UtcNow;
    }
    private Task? _worker;
    private long _dropped;
    private int _disposed;
    protected virtual int FlushIntervalMs => 5000;
    protected virtual int MaxBatchSize => 512;
    protected virtual bool LogsEnabled => true;
    protected virtual bool MetricsEnabled => true;
    protected virtual bool TracesEnabled => true;
    protected abstract Task Export(IReadOnlyList<JsonObject> batch, CancellationToken token);
    protected void Enqueue(string signal, JsonObject value)
    {
        if (_disposed != 0) return;
        value["signal"] = signal;
        if (!_queue.Writer.TryWrite(value) && Interlocked.Increment(ref _dropped) % 1000 == 1)
            Console.Error.WriteLine($"[{PluginName}] Telemetry queue full; dropped {_dropped} entries");
    }
    protected override void Write(JsonObject entry) { if (LogsEnabled) Enqueue("logs", entry); }
    public override void SpanEnded(CompletedSpan span)
    {
        if (TracesEnabled) Enqueue("traces", JsonSerializer.SerializeToNode(span, EventSchemaExport.JsonOptions)!.AsObject());
    }
    public override Task Run(IObservable obs) { _worker ??= Pump(); return Task.CompletedTask; }
    private async Task Pump()
    {
        while (true)
        {
            try { await Task.Delay(FlushIntervalMs, _flush.Token); } catch (OperationCanceledException) { }
            while (_queue.Reader.TryRead(out var first))
            {
                var batch = new List<JsonObject> { first };
                while (batch.Count < MaxBatchSize && _queue.Reader.TryRead(out var next)) batch.Add(next);
                try { await Export(batch, _shutdown.Token); }
                catch (Exception error) { Console.Error.WriteLine($"[{PluginName}] Export failed ({batch.Count} entries): {error.GetType().Name}"); }
                if (_shutdown.IsCancellationRequested) return;
            }
            if (_flush.IsCancellationRequested) return;
        }
    }
    public override async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
        _queue.Writer.TryComplete(); _flush.Cancel(); _shutdown.CancelAfter(TimeSpan.FromSeconds(10));
        _worker ??= Pump();
        await _worker;
        _flush.Dispose(); _shutdown.Dispose();
    }
    private void Instrument(string plugin, string name, string kind, string description, string unit)
    {
        var value = (kind, description, unit);
        if (!_instruments.TryAdd((plugin, name), value) && _instruments[(plugin, name)] != value) throw new ArgumentException($"Conflicting metric definition: {plugin}.{name}");
    }
    public override void CreateCounter(string pluginName, string name, string description, string unit) => Instrument(pluginName, name, "counter", description, unit);
    public override void CreateGauge(string pluginName, string name, string description, string unit) => Instrument(pluginName, name, "gauge", description, unit);
    public override void CreateHistogram(string pluginName, string name, string description, string unit) => Instrument(pluginName, name, "histogram", description, unit);
    private void Metric(string plugin, string name, double value, Dictionary<string, string>? labels, string expected, bool increment = false)
    {
        if (!MetricsEnabled || _disposed != 0) return;
        if (!double.IsFinite(value) || (expected == "counter" && value < 0)) throw new ArgumentOutOfRangeException(nameof(value));
        if (!_instruments.TryGetValue((plugin, name), out var instrument) || instrument.Kind != expected) throw new ArgumentException($"Unknown {expected}: {plugin}.{name}");
        var normalizedLabels = labels ?? new();
        var key = JsonSerializer.Serialize(new { plugin, name, labels = normalizedLabels.OrderBy(x => x.Key, StringComparer.Ordinal) });
        // ponytail: cap metric series at 10,000; add configurable cardinality limits if a deployment needs more.
        if (_series.Count >= 10000 && !_series.ContainsKey(key)) return;
        var state = _series.GetOrAdd(key, _ => new());
        lock (state)
        {
            state.Value = expected == "counter" || increment ? state.Value + value : value;
            state.Count++; state.Sum += value; state.Min = Math.Min(state.Min, value); state.Max = Math.Max(state.Max, value);
            Enqueue("metrics", new JsonObject { ["name"] = name, ["plugin"] = plugin, ["kind"] = expected, ["description"] = instrument.Description,
                ["unit"] = instrument.Unit, ["value"] = state.Value, ["labels"] = JsonSerializer.SerializeToNode(normalizedLabels.OrderBy(x => x.Key, StringComparer.Ordinal).ToDictionary(x => x.Key, x => x.Value)),
                ["count"] = state.Count, ["sum"] = state.Sum, ["min"] = state.Min, ["max"] = state.Max,
                ["started"] = state.Started.ToString("O"), ["timestamp"] = DateTimeOffset.UtcNow.ToString("O") });
        }
    }
    public override void IncrementCounter(string pluginName, string name, double value, Dictionary<string, string>? labels = null) => Metric(pluginName, name, value, labels, "counter");
    public override void SetGauge(string pluginName, string name, double value, Dictionary<string, string>? labels = null) => Metric(pluginName, name, value, labels, "gauge");
    public override void IncrementGauge(string pluginName, string name, double value, Dictionary<string, string>? labels = null) => Metric(pluginName, name, value, labels, "gauge", true);
    public override void DecrementGauge(string pluginName, string name, double value, Dictionary<string, string>? labels = null) => Metric(pluginName, name, -value, labels, "gauge", true);
    public override void RecordHistogram(string pluginName, string name, double value, Dictionary<string, string>? labels = null) => Metric(pluginName, name, value, labels, "histogram");
}

/// <summary>HTTP exports never follow redirects carrying tokens; retries are limited to transient failures.</summary>
public sealed class TelemetryHttp : IDisposable
{
    private readonly HttpClient _client;
    public TelemetryHttp(HttpMessageHandler? handler = null) => _client = new(handler ?? new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(5) };
    public async Task Post(Uri endpoint, object body, IReadOnlyDictionary<string, string>? headers, CancellationToken token)
    {
        if (endpoint.Scheme is not ("http" or "https") || endpoint.UserInfo.Length > 0) throw new ArgumentException("Invalid telemetry HTTP endpoint");
        var encoded = JsonSerializer.SerializeToUtf8Bytes(body, EventSchemaExport.JsonOptions);
        if (encoded.Length > 64 * 1024 * 1024) throw new InvalidDataException("Telemetry batch exceeds 64 MiB");
        for (var attempt = 0; ; attempt++)
        {
            var delay = TimeSpan.FromMilliseconds(200 * (1 << attempt));
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
            timeout.CancelAfter(TimeSpan.FromSeconds(5));
            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint) { Content = new ByteArrayContent(encoded) };
            request.Content.Headers.ContentType = new("application/json");
            if (headers is not null) foreach (var (name, value) in headers) request.Headers.Add(name, value);
            try
            {
                using var response = await _client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
                if (response.IsSuccessStatusCode)
                {
                    try
                    {
                        await response.Content.LoadIntoBufferAsync(4 * 1024 * 1024, timeout.Token);
                        var text = await response.Content.ReadAsStringAsync(timeout.Token);
                        if (!string.IsNullOrWhiteSpace(text) && response.Content.Headers.ContentType?.MediaType == "application/json")
                        {
                            var result = JsonNode.Parse(text) as JsonObject;
                            if (result?["failed"]?.GetValue<int>() > 0 || result?["partialSuccess"] is JsonObject partial &&
                                partial.Any(x => x.Value is not null && x.Value.ToString() is not ("" or "0")))
                                throw new InvalidDataException("Telemetry endpoint rejected part of the batch");
                        }
                    }
                    catch (Exception error) when (error is HttpRequestException or JsonException or OperationCanceledException)
                    { throw new InvalidDataException("Invalid telemetry acknowledgement; accepted batches are not retried", error); }
                    return;
                }
                if (attempt >= 2 || response.StatusCode is not (HttpStatusCode.TooManyRequests or HttpStatusCode.BadGateway or HttpStatusCode.ServiceUnavailable or HttpStatusCode.GatewayTimeout))
                    throw new HttpRequestException($"Telemetry HTTP {(int)response.StatusCode}", null, response.StatusCode);
                var retryAfter = response.Headers.RetryAfter;
                var requestedDelay = retryAfter?.Delta ?? retryAfter?.Date - DateTimeOffset.UtcNow;
                if (requestedDelay > delay) delay = TimeSpan.FromMilliseconds(Math.Min(requestedDelay.Value.TotalMilliseconds, 2000));
            }
            catch (HttpRequestException error) when (error.StatusCode is null && attempt < 2) { }
            catch (OperationCanceledException) when (!token.IsCancellationRequested && attempt < 2) { }
            await Task.Delay(delay, token);
        }
    }
    public void Dispose() => _client.Dispose();
}
