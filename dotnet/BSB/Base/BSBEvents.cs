namespace BSB.Base;

using BSB.Interfaces;

/// <summary>
/// Delegate for handling fire-and-forget events.
/// </summary>
/// <param name="obs">Observable for tracing and logging within the handler.</param>
/// <param name="data">Event payload data.</param>
public delegate Task EventHandler(IObservable obs, object? data);

/// <summary>
/// Delegate for handling returnable events (request-response pattern).
/// </summary>
/// <param name="obs">Observable for tracing and logging within the handler.</param>
/// <param name="data">Request payload data.</param>
/// <returns>The response payload.</returns>
public delegate Task<object?> ReturnableEventHandler(IObservable obs, object? data);

/// <summary>
/// Delegate for handling broadcast events (fan-out to all subscribers).
/// </summary>
/// <param name="obs">Observable for tracing and logging within the handler.</param>
/// <param name="data">Broadcast payload data.</param>
public delegate Task BroadcastHandler(IObservable obs, object? data);

/// <summary>
/// Abstract base for event routing plugins. Routes events between service plugins
/// using fire-and-forget, returnable (request-response), broadcast, and stream patterns.
/// Different implementations may use in-process dispatch, RabbitMQ, Redis, etc.
/// </summary>
public abstract class BSBEvents : MainBase
{
    /// <summary>
    /// Construct a new events plugin.
    /// </summary>
    /// <param name="args">Plugin construction arguments supplied by the framework.</param>
    protected BSBEvents(PluginConstructorArgs args) : base(args) { }

    /// <summary>
    /// Initialize the events plugin. Called once during startup.
    /// </summary>
    /// <param name="obs">Observable for logging during initialization.</param>
    public virtual Task Init(IObservable obs) => Task.CompletedTask;

    /// <summary>
    /// Run phase for the events plugin. Called after all plugins are initialized.
    /// Use this to start consuming from message queues, etc.
    /// </summary>
    /// <param name="obs">Observable for logging during run.</param>
    public virtual Task Run(IObservable obs) => Task.CompletedTask;

    // --- Fire-and-forget events ---

    /// <summary>
    /// Register a handler for a fire-and-forget event.
    /// </summary>
    /// <param name="pluginName">The owning plugin name (event namespace).</param>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <param name="handler">The handler to invoke when the event is emitted.</param>
    public abstract Task OnEvent(string pluginName, string eventName, IObservable obs, EventHandler handler);

    /// <summary>
    /// Emit a fire-and-forget event. The handler is invoked but the caller does not wait for a result.
    /// </summary>
    /// <param name="pluginName">The target plugin name (event namespace).</param>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <param name="data">Event payload data.</param>
    public abstract Task EmitEvent(string pluginName, string eventName, IObservable obs, object? data);

    // --- Returnable events (request-response) ---

    /// <summary>
    /// Register a handler for a returnable event (request-response pattern).
    /// </summary>
    /// <param name="pluginName">The owning plugin name (event namespace).</param>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <param name="handler">The handler that processes the request and returns a response.</param>
    public abstract Task OnReturnableEvent(string pluginName, string eventName, IObservable obs, ReturnableEventHandler handler);

    /// <summary>
    /// Emit an event and wait for a response from the handler.
    /// </summary>
    /// <param name="pluginName">The target plugin name (event namespace).</param>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <param name="data">Request payload data.</param>
    /// <param name="timeoutSeconds">Maximum time to wait for a response.</param>
    /// <returns>The response from the handler.</returns>
    public abstract Task<object?> EmitEventAndReturn(string pluginName, string eventName, IObservable obs, object? data, int timeoutSeconds = 30);

    // --- Broadcast events ---

    /// <summary>
    /// Register a handler for a broadcast event (fan-out to all subscribers).
    /// </summary>
    /// <param name="pluginName">The owning plugin name (event namespace).</param>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <param name="handler">The handler to invoke for each broadcast.</param>
    public abstract Task OnBroadcast(string pluginName, string eventName, IObservable obs, BroadcastHandler handler);

    /// <summary>
    /// Emit a broadcast event to all registered handlers.
    /// </summary>
    /// <param name="pluginName">The target plugin name (event namespace).</param>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <param name="data">Broadcast payload data.</param>
    public abstract Task EmitBroadcast(string pluginName, string eventName, IObservable obs, object? data);

    // --- Stream events ---

    /// <summary>
    /// Open a stream to receive data from a named event channel.
    /// </summary>
    /// <param name="pluginName">The target plugin name (event namespace).</param>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <returns>A readable stream of incoming data.</returns>
    public abstract Task<Stream> ReceiveStream(string pluginName, string eventName, IObservable obs);

    /// <summary>
    /// Send a stream of data to a named event channel.
    /// </summary>
    /// <param name="pluginName">The target plugin name (event namespace).</param>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <param name="data">The stream of data to send.</param>
    public abstract Task SendStream(string pluginName, string eventName, IObservable obs, Stream data);
}
