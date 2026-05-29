namespace BSB.Base;

using BSB.Interfaces;

/// <summary>
/// Internal observable implementation. Routes logging, metrics, and tracing
/// calls to all registered <see cref="IObservablePlugin"/> instances.
/// Each span creates a child <see cref="ObservableBackend"/> with a new span ID
/// while preserving the parent trace ID.
/// </summary>
internal class ObservableBackend : IObservable
{
    private readonly List<IObservablePlugin> _observers;
    private readonly string _pluginName;
    private readonly string _spanName;
    private readonly Dictionary<string, object?> _attributes;
    private readonly ResourceContext _resource;
    private bool _ended;

    /// <summary>
    /// The distributed trace context for this span.
    /// </summary>
    public DTrace Trace { get; }

    /// <summary>
    /// The trace ID from the distributed trace.
    /// </summary>
    public string TraceId => Trace.TraceId;

    /// <summary>
    /// The span ID from the distributed trace.
    /// </summary>
    public string SpanId => Trace.SpanId;

    /// <summary>
    /// Resource context describing the service/host.
    /// </summary>
    public ResourceContext Resource => _resource;

    /// <summary>
    /// Attributes attached to this span.
    /// </summary>
    public IReadOnlyDictionary<string, object?> Attributes => _attributes;

    /// <summary>
    /// Structured logging API scoped to this span.
    /// </summary>
    public IObservableLog Log { get; }

    /// <summary>
    /// Metrics creation API scoped to this span's plugin.
    /// </summary>
    public IObservableMetrics Metrics { get; }

    /// <summary>
    /// Create a new observable backend (root or child span).
    /// </summary>
    /// <param name="pluginName">Name of the plugin this observable is scoped to.</param>
    /// <param name="spanName">Human-readable name for the span.</param>
    /// <param name="resource">Resource context for the service.</param>
    /// <param name="observers">List of observable plugins to dispatch to.</param>
    /// <param name="trace">Distributed trace context. If null, a new trace is generated.</param>
    /// <param name="attributes">Initial span attributes.</param>
    internal ObservableBackend(
        string pluginName,
        string spanName,
        ResourceContext resource,
        List<IObservablePlugin> observers,
        DTrace? trace = null,
        Dictionary<string, object?>? attributes = null)
    {
        _pluginName = pluginName;
        _spanName = spanName;
        _resource = resource;
        _observers = observers;
        _attributes = attributes ?? new();
        Trace = trace ?? DTrace.Generate();

        Log = new ObservableLog(this);
        Metrics = new ObservableMetrics(this);
    }

    /// <summary>
    /// Create a child span under the current trace.
    /// </summary>
    /// <param name="name">Name for the child span.</param>
    /// <param name="attributes">Optional attributes for the child span.</param>
    /// <returns>A new observable representing the child span.</returns>
    public IObservable StartSpan(string name, Dictionary<string, object?>? attributes = null)
    {
        var childTrace = Trace.NewSpan();
        var merged = new Dictionary<string, object?>(_attributes);
        if (attributes is not null)
        {
            foreach (var (k, v) in attributes)
                merged[k] = v;
        }
        return new ObservableBackend(_pluginName, name, _resource, _observers, childTrace, merged);
    }

    /// <summary>
    /// Set a single attribute on this span.
    /// </summary>
    /// <param name="key">Attribute key.</param>
    /// <param name="value">Attribute value.</param>
    /// <returns>This observable for chaining.</returns>
    public IObservable SetAttribute(string key, object? value)
    {
        _attributes[key] = value;
        return this;
    }

    /// <summary>
    /// Set multiple attributes on this span.
    /// </summary>
    /// <param name="attributes">Key-value pairs to set.</param>
    /// <returns>This observable for chaining.</returns>
    public IObservable SetAttributes(Dictionary<string, object?> attributes)
    {
        foreach (var (k, v) in attributes)
            _attributes[k] = v;
        return this;
    }

    /// <summary>
    /// Record an error on this span.
    /// </summary>
    /// <param name="error">The exception to record.</param>
    /// <param name="attributes">Optional additional attributes.</param>
    public void Error(Exception error, Dictionary<string, object?>? attributes = null)
    {
        if (attributes is not null)
            SetAttributes(attributes);
        foreach (var observer in _observers)
            observer.Error(Trace, _pluginName, error, error.Message);
    }

    /// <summary>
    /// End this span. Subsequent calls are no-ops.
    /// </summary>
    /// <param name="attributes">Optional final attributes to set before ending.</param>
    public void End(Dictionary<string, object?>? attributes = null)
    {
        if (_ended) return;
        _ended = true;
        if (attributes is not null)
            SetAttributes(attributes);
    }

    // -----------------------------------------------------------------------
    // Inner Log implementation
    // -----------------------------------------------------------------------

    /// <summary>
    /// Structured logging implementation that dispatches to all observers.
    /// </summary>
    private sealed class ObservableLog : IObservableLog
    {
        private readonly ObservableBackend _backend;

        internal ObservableLog(ObservableBackend backend) => _backend = backend;

        /// <inheritdoc />
        public void Debug(string message, LogMeta? meta = null)
        {
            foreach (var obs in _backend._observers)
                obs.Debug(_backend.Trace, _backend._pluginName, message, meta);
        }

        /// <inheritdoc />
        public void Info(string message, LogMeta? meta = null)
        {
            foreach (var obs in _backend._observers)
                obs.Info(_backend.Trace, _backend._pluginName, message, meta);
        }

        /// <inheritdoc />
        public void Warn(string message, LogMeta? meta = null)
        {
            foreach (var obs in _backend._observers)
                obs.Warn(_backend.Trace, _backend._pluginName, message, meta);
        }

        /// <inheritdoc />
        public void Error(string message, LogMeta? meta = null)
        {
            foreach (var obs in _backend._observers)
                obs.Error(_backend.Trace, _backend._pluginName, message, meta);
        }

        /// <inheritdoc />
        public void Error(Exception ex, string? message = null, LogMeta? meta = null)
        {
            foreach (var obs in _backend._observers)
                obs.Error(_backend.Trace, _backend._pluginName, ex, message ?? ex.Message, meta);
        }
    }

    // -----------------------------------------------------------------------
    // Inner Metrics implementation
    // -----------------------------------------------------------------------

    /// <summary>
    /// Metrics creation implementation that dispatches to all observers.
    /// </summary>
    private sealed class ObservableMetrics : IObservableMetrics
    {
        private readonly ObservableBackend _backend;

        internal ObservableMetrics(ObservableBackend backend) => _backend = backend;

        /// <inheritdoc />
        public ICounter Counter(string name, string description, string unit)
        {
            foreach (var obs in _backend._observers)
                obs.CreateCounter(_backend._pluginName, name, description, unit);
            return new BackendCounter(name, _backend._observers);
        }

        /// <inheritdoc />
        public IGauge Gauge(string name, string description, string unit)
        {
            foreach (var obs in _backend._observers)
                obs.CreateGauge(_backend._pluginName, name, description, unit);
            return new BackendGauge(name, _backend._observers);
        }

        /// <inheritdoc />
        public IHistogram Histogram(string name, string description, string unit)
        {
            foreach (var obs in _backend._observers)
                obs.CreateHistogram(_backend._pluginName, name, description, unit);
            return new BackendHistogram(name, _backend._observers);
        }

        /// <inheritdoc />
        public ITimer Timer() => new DefaultTimer();
    }

    // -----------------------------------------------------------------------
    // Metric instrument implementations
    // -----------------------------------------------------------------------

    /// <summary>
    /// Counter instrument that dispatches increments to all observers.
    /// </summary>
    private sealed class BackendCounter : ICounter
    {
        private readonly string _name;
        private readonly List<IObservablePlugin> _observers;

        internal BackendCounter(string name, List<IObservablePlugin> observers)
        {
            _name = name;
            _observers = observers;
        }

        /// <inheritdoc />
        public void Increment(double value = 1, Dictionary<string, string>? labels = null)
        {
            foreach (var obs in _observers)
                obs.IncrementCounter(_name, value, labels);
        }
    }

    /// <summary>
    /// Gauge instrument that dispatches set/increment/decrement to all observers.
    /// </summary>
    private sealed class BackendGauge : IGauge
    {
        private readonly string _name;
        private readonly List<IObservablePlugin> _observers;

        internal BackendGauge(string name, List<IObservablePlugin> observers)
        {
            _name = name;
            _observers = observers;
        }

        /// <inheritdoc />
        public void Set(double value, Dictionary<string, string>? labels = null)
        {
            foreach (var obs in _observers)
                obs.SetGauge(_name, value, labels);
        }

        /// <inheritdoc />
        public void Increment(double value = 1, Dictionary<string, string>? labels = null)
        {
            foreach (var obs in _observers)
                obs.IncrementGauge(_name, value, labels);
        }

        /// <inheritdoc />
        public void Decrement(double value = 1, Dictionary<string, string>? labels = null)
        {
            foreach (var obs in _observers)
                obs.DecrementGauge(_name, value, labels);
        }
    }

    /// <summary>
    /// Histogram instrument that dispatches record calls to all observers.
    /// </summary>
    private sealed class BackendHistogram : IHistogram
    {
        private readonly string _name;
        private readonly List<IObservablePlugin> _observers;

        internal BackendHistogram(string name, List<IObservablePlugin> observers)
        {
            _name = name;
            _observers = observers;
        }

        /// <inheritdoc />
        public void Record(double value, Dictionary<string, string>? labels = null)
        {
            foreach (var obs in _observers)
                obs.RecordHistogram(_name, value, labels);
        }
    }
}
