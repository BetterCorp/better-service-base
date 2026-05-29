namespace BSB.Base;

using BSB.Interfaces;

/// <summary>
/// Abstract base for business logic service plugins.
/// This is the primary class that plugin developers extend to build services.
/// Provides type-safe configuration, event API, observable tracing, and
/// lifecycle hooks (Init, Run, Dispose).
/// </summary>
/// <typeparam name="TConfig">Plugin configuration type.</typeparam>
public abstract class BSBService<TConfig> : MainBase
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
    /// Plugin metadata (name, description, dependencies, etc).
    /// Override in derived class to provide metadata.
    /// </summary>
    public static BSBPluginMetadata? Metadata { get; }

    /// <summary>
    /// Event schemas for this plugin. Override in derived class to declare
    /// the events this plugin emits and handles.
    /// </summary>
    public static BSBEventSchemas? EventSchemas { get; }

    /// <summary>
    /// Internal observable backend for creating traces.
    /// Set by the framework after construction.
    /// </summary>
    internal IObservable? InternalObservable { get; set; }

    /// <summary>
    /// Construct a new service plugin.
    /// </summary>
    /// <param name="args">Service constructor args containing configuration.</param>
    protected BSBService(ServiceConstructorArgs<TConfig> args) : base(args)
    {
        Config = args.Config;
    }

    /// <summary>
    /// Initialization phase -- set up resources, register event handlers.
    /// Called after all plugins are constructed, in dependency order.
    /// </summary>
    /// <param name="obs">Observable for logging and tracing during initialization.</param>
    public virtual Task Init(IObservable obs) => Task.CompletedTask;

    /// <summary>
    /// Run phase -- start processing, open connections, begin work.
    /// Called after all plugins are initialized, in dependency order.
    /// </summary>
    /// <param name="obs">Observable for logging and tracing during run.</param>
    public virtual Task Run(IObservable obs) => Task.CompletedTask;

    /// <summary>
    /// Create a new root trace for independent operations (background tasks,
    /// scheduled jobs, etc). The returned observable is a new root span.
    /// </summary>
    /// <param name="name">Name for the new trace/span.</param>
    /// <param name="attributes">Optional initial attributes.</param>
    /// <returns>A new observable representing a root span.</returns>
    /// <exception cref="InvalidOperationException">
    /// Thrown if the observable backend has not been initialized by the framework.
    /// </exception>
    public IObservable CreateTrace(string name, Dictionary<string, object?>? attributes = null)
    {
        if (InternalObservable is null)
            throw new InvalidOperationException("Observable backend not initialized");
        return InternalObservable.StartSpan(name, attributes);
    }
}
