namespace BSB.Interfaces;

/// <summary>
/// Structured log entry metadata. Key-value pairs attached to a log message.
/// </summary>
public class LogMeta : Dictionary<string, object?>
{
    /// <summary>
    /// Create an empty metadata container.
    /// </summary>
    public LogMeta() { }

    /// <summary>
    /// Create metadata from an existing dictionary.
    /// </summary>
    public LogMeta(IDictionary<string, object?> dict) : base(dict) { }
}

/// <summary>
/// Logging interface for observable spans. All log calls are attached to the current span context.
/// </summary>
public interface IObservableLog
{
    /// <summary>
    /// Log a debug-level message.
    /// </summary>
    void Debug(string message, LogMeta? meta = null);

    /// <summary>
    /// Log an informational message.
    /// </summary>
    void Info(string message, LogMeta? meta = null);

    /// <summary>
    /// Log a warning message.
    /// </summary>
    void Warn(string message, LogMeta? meta = null);

    /// <summary>
    /// Log an error message.
    /// </summary>
    void Error(string message, LogMeta? meta = null);

    /// <summary>
    /// Log an exception with an optional message.
    /// </summary>
    void Error(Exception ex, string? message = null, LogMeta? meta = null);
}

/// <summary>
/// Metrics factory interface for observable spans.
/// Creates metric instruments scoped to the current service context.
/// </summary>
public interface IObservableMetrics
{
    /// <summary>
    /// Create a monotonically increasing counter.
    /// </summary>
    ICounter Counter(string name, string description, string unit);

    /// <summary>
    /// Create a gauge that can go up and down.
    /// </summary>
    IGauge Gauge(string name, string description, string unit);

    /// <summary>
    /// Create a histogram for recording value distributions.
    /// </summary>
    IHistogram Histogram(string name, string description, string unit);

    /// <summary>
    /// Create a timer that measures elapsed duration.
    /// </summary>
    ITimer Timer();
}

/// <summary>
/// OpenTelemetry-compatible resource context for identifying the service instance.
/// </summary>
public class ResourceContext
{
    /// <summary>
    /// Logical name of the service (e.g. "my-api").
    /// </summary>
    public string ServiceName { get; init; } = "";

    /// <summary>
    /// Version of the service (e.g. "1.2.3").
    /// </summary>
    public string ServiceVersion { get; init; } = "";

    /// <summary>
    /// Unique identifier for this service instance.
    /// </summary>
    public string ServiceInstanceId { get; init; } = "";

    /// <summary>
    /// Deployment environment (e.g. "production", "staging").
    /// </summary>
    public string DeploymentEnvironment { get; init; } = "";

    /// <summary>
    /// Optional deployment region (e.g. "us-east-1").
    /// </summary>
    public string? DeploymentRegion { get; init; }

    /// <summary>
    /// Convert to OpenTelemetry resource attribute dictionary.
    /// </summary>
    public Dictionary<string, string> ToAttributes()
    {
        var attrs = new Dictionary<string, string>
        {
            ["service.name"] = ServiceName,
            ["service.version"] = ServiceVersion,
            ["service.instance.id"] = ServiceInstanceId,
            ["deployment.environment"] = DeploymentEnvironment,
        };
        if (DeploymentRegion is not null)
            attrs["deployment.region"] = DeploymentRegion;
        return attrs;
    }
}

/// <summary>
/// Core observability interface - unified logging, metrics, and distributed tracing.
/// All plugin lifecycle methods receive an <see cref="IObservable"/> for structured telemetry.
/// </summary>
public interface IObservable
{
    /// <summary>
    /// The distributed trace context for this span.
    /// </summary>
    DTrace Trace { get; }

    /// <summary>
    /// Shortcut for <c>Trace.TraceId</c>.
    /// </summary>
    string TraceId { get; }

    /// <summary>
    /// Shortcut for <c>Trace.SpanId</c>.
    /// </summary>
    string SpanId { get; }

    /// <summary>
    /// Resource context identifying the service instance.
    /// </summary>
    ResourceContext Resource { get; }

    /// <summary>
    /// Attributes set on this span.
    /// </summary>
    IReadOnlyDictionary<string, object?> Attributes { get; }

    /// <summary>
    /// Structured logging interface scoped to this span.
    /// </summary>
    IObservableLog Log { get; }

    /// <summary>
    /// Metrics factory scoped to this service context.
    /// </summary>
    IObservableMetrics Metrics { get; }

    /// <summary>
    /// Create a child span within the current trace.
    /// </summary>
    IObservable StartSpan(string name, Dictionary<string, object?>? attributes = null);

    /// <summary>
    /// Set a single attribute on this span.
    /// </summary>
    IObservable SetAttribute(string key, object? value);

    /// <summary>
    /// Set multiple attributes on this span.
    /// </summary>
    IObservable SetAttributes(Dictionary<string, object?> attributes);

    /// <summary>
    /// Record an error on this span.
    /// </summary>
    void Error(Exception error, Dictionary<string, object?>? attributes = null);

    /// <summary>
    /// End this span, optionally adding final attributes.
    /// </summary>
    void End(Dictionary<string, object?>? attributes = null);
}
