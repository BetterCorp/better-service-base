namespace BSB.Base;

using BSB.Interfaces;

/// <summary>
/// Abstract base for observability plugins. Handles logging, metrics creation,
/// and tracing. Observable plugins receive calls from the framework and route
/// them to backends (console, files, OTLP, Graylog, etc).
/// Observable plugins do NOT have a run() phase -- they are passive receivers.
/// Implements <see cref="IObservablePlugin"/> so that <see cref="ObservableBackend"/>
/// can dispatch to any observable regardless of its config type.
/// </summary>
/// <typeparam name="TConfig">Plugin configuration type.</typeparam>
public abstract class BSBObservable<TConfig> : MainBase, IObservablePlugin
{
    /// <summary>
    /// Type-safe access to plugin configuration.
    /// </summary>
    protected TConfig Config { get; }

    /// <summary>
    /// Construct a new observable plugin.
    /// </summary>
    /// <param name="args">Service constructor args containing configuration.</param>
    protected BSBObservable(ServiceConstructorArgs<TConfig> args) : base(args)
    {
        Config = args.Config;
    }

    /// <summary>
    /// Initialize the observable plugin. Called once during startup.
    /// </summary>
    /// <param name="obs">Observable for logging during initialization.</param>
    public virtual Task Init(IObservable obs) => Task.CompletedTask;

    // --- Logging methods ---
    // Override any or all to handle log output for your backend.

    /// <inheritdoc />
    public virtual void Debug(DTrace trace, string pluginName, string message, LogMeta? meta = null) { }

    /// <inheritdoc />
    public virtual void Info(DTrace trace, string pluginName, string message, LogMeta? meta = null) { }

    /// <inheritdoc />
    public virtual void Warn(DTrace trace, string pluginName, string message, LogMeta? meta = null) { }

    /// <inheritdoc />
    public virtual void Error(DTrace trace, string pluginName, string message, LogMeta? meta = null) { }

    /// <inheritdoc />
    public virtual void Error(DTrace trace, string pluginName, Exception error, string? message = null, LogMeta? meta = null) { }

    // --- Metrics creation ---
    // Override to register metric instruments with your backend.

    /// <inheritdoc />
    public virtual void CreateCounter(string pluginName, string name, string description, string unit) { }

    /// <inheritdoc />
    public virtual void CreateGauge(string pluginName, string name, string description, string unit) { }

    /// <inheritdoc />
    public virtual void CreateHistogram(string pluginName, string name, string description, string unit) { }

    // --- Metrics recording ---
    // Override to record metric values in your backend.

    /// <inheritdoc />
    public virtual void IncrementCounter(string name, double value, Dictionary<string, string>? labels = null) { }

    /// <inheritdoc />
    public virtual void SetGauge(string name, double value, Dictionary<string, string>? labels = null) { }

    /// <inheritdoc />
    public virtual void IncrementGauge(string name, double value, Dictionary<string, string>? labels = null) { }

    /// <inheritdoc />
    public virtual void DecrementGauge(string name, double value, Dictionary<string, string>? labels = null) { }

    /// <inheritdoc />
    public virtual void RecordHistogram(string name, double value, Dictionary<string, string>? labels = null) { }
}
