namespace BSB.Base;

using BSB.Interfaces;

/// <summary>
/// Non-generic interface for observable plugin methods.
/// Used internally by <see cref="ObservableBackend"/> to dispatch log,
/// metric, and trace calls to observable plugins without needing to
/// know their configuration type.
/// </summary>
public interface IObservablePlugin
{
    /// <summary>Log a debug-level message.</summary>
    /// <param name="trace">Active distributed trace.</param>
    /// <param name="pluginName">Name of the originating plugin.</param>
    /// <param name="message">Log message.</param>
    /// <param name="meta">Optional structured metadata.</param>
    void Debug(DTrace trace, string pluginName, string message, LogMeta? meta = null);

    /// <summary>Log an info-level message.</summary>
    /// <param name="trace">Active distributed trace.</param>
    /// <param name="pluginName">Name of the originating plugin.</param>
    /// <param name="message">Log message.</param>
    /// <param name="meta">Optional structured metadata.</param>
    void Info(DTrace trace, string pluginName, string message, LogMeta? meta = null);

    /// <summary>Log a warning-level message.</summary>
    /// <param name="trace">Active distributed trace.</param>
    /// <param name="pluginName">Name of the originating plugin.</param>
    /// <param name="message">Log message.</param>
    /// <param name="meta">Optional structured metadata.</param>
    void Warn(DTrace trace, string pluginName, string message, LogMeta? meta = null);

    /// <summary>Log an error-level message.</summary>
    /// <param name="trace">Active distributed trace.</param>
    /// <param name="pluginName">Name of the originating plugin.</param>
    /// <param name="message">Error message.</param>
    /// <param name="meta">Optional structured metadata.</param>
    void Error(DTrace trace, string pluginName, string message, LogMeta? meta = null);

    /// <summary>Log an error-level message with an exception.</summary>
    /// <param name="trace">Active distributed trace.</param>
    /// <param name="pluginName">Name of the originating plugin.</param>
    /// <param name="error">The exception to log.</param>
    /// <param name="message">Optional override message (defaults to exception message).</param>
    /// <param name="meta">Optional structured metadata.</param>
    void Error(DTrace trace, string pluginName, Exception error, string? message = null, LogMeta? meta = null);

    /// <summary>Register a counter metric instrument.</summary>
    /// <param name="pluginName">Owning plugin name.</param>
    /// <param name="name">Metric name.</param>
    /// <param name="description">Human-readable description.</param>
    /// <param name="unit">Unit of measurement.</param>
    void CreateCounter(string pluginName, string name, string description, string unit);

    /// <summary>Register a gauge metric instrument.</summary>
    /// <param name="pluginName">Owning plugin name.</param>
    /// <param name="name">Metric name.</param>
    /// <param name="description">Human-readable description.</param>
    /// <param name="unit">Unit of measurement.</param>
    void CreateGauge(string pluginName, string name, string description, string unit);

    /// <summary>Register a histogram metric instrument.</summary>
    /// <param name="pluginName">Owning plugin name.</param>
    /// <param name="name">Metric name.</param>
    /// <param name="description">Human-readable description.</param>
    /// <param name="unit">Unit of measurement.</param>
    void CreateHistogram(string pluginName, string name, string description, string unit);

    /// <summary>Increment a counter by the given value.</summary>
    /// <param name="name">Counter name.</param>
    /// <param name="value">Increment amount.</param>
    /// <param name="labels">Optional dimension labels.</param>
    void IncrementCounter(string name, double value, Dictionary<string, string>? labels = null);

    /// <summary>Set a gauge to an absolute value.</summary>
    /// <param name="name">Gauge name.</param>
    /// <param name="value">Value to set.</param>
    /// <param name="labels">Optional dimension labels.</param>
    void SetGauge(string name, double value, Dictionary<string, string>? labels = null);

    /// <summary>Increment a gauge by the given value.</summary>
    /// <param name="name">Gauge name.</param>
    /// <param name="value">Increment amount.</param>
    /// <param name="labels">Optional dimension labels.</param>
    void IncrementGauge(string name, double value, Dictionary<string, string>? labels = null);

    /// <summary>Decrement a gauge by the given value.</summary>
    /// <param name="name">Gauge name.</param>
    /// <param name="value">Decrement amount.</param>
    /// <param name="labels">Optional dimension labels.</param>
    void DecrementGauge(string name, double value, Dictionary<string, string>? labels = null);

    /// <summary>Record a value in a histogram.</summary>
    /// <param name="name">Histogram name.</param>
    /// <param name="value">Observed value.</param>
    /// <param name="labels">Optional dimension labels.</param>
    void RecordHistogram(string name, double value, Dictionary<string, string>? labels = null);
}
