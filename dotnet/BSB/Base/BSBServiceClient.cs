namespace BSB.Base;

using BSB.Interfaces;

/// <summary>
/// Abstract base for service client plugins.
/// Used for strongly-typed cross-plugin communication via generated typed clients.
/// A service client wraps another plugin's event API so callers get
/// compile-time type safety instead of stringly-typed event names.
/// </summary>
/// <typeparam name="TConfig">Plugin configuration type.</typeparam>
public abstract class BSBServiceClient<TConfig> : MainBase
{
    /// <summary>
    /// Type-safe access to plugin configuration.
    /// </summary>
    protected TConfig Config { get; }

    /// <summary>
    /// Event API for emitting and listening to cross-plugin events.
    /// Set by the framework after construction.
    /// </summary>
    public PluginEvents Events { get; internal set; } = null!;

    /// <summary>
    /// Internal observable backend for creating traces.
    /// Set by the framework after construction.
    /// </summary>
    internal IObservable? InternalObservable { get; set; }

    /// <summary>
    /// Construct a new service client plugin.
    /// </summary>
    /// <param name="args">Service constructor args containing configuration.</param>
    protected BSBServiceClient(ServiceConstructorArgs<TConfig> args) : base(args)
    {
        Config = args.Config;
    }

    /// <summary>
    /// Initialization phase -- set up resources, register event handlers.
    /// </summary>
    /// <param name="obs">Observable for logging and tracing during initialization.</param>
    public virtual Task Init(IObservable obs) => Task.CompletedTask;

    /// <summary>
    /// Run phase -- start processing.
    /// </summary>
    /// <param name="obs">Observable for logging and tracing during run.</param>
    public virtual Task Run(IObservable obs) => Task.CompletedTask;
}
