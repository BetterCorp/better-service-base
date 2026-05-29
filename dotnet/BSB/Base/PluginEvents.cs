namespace BSB.Base;

using BSB.Interfaces;

/// <summary>
/// Event API for service plugins. Wraps the <see cref="BSBEvents"/> backend with
/// plugin-scoped operations so that callers do not need to pass their plugin name
/// on every call. Accessible via <c>BSBService.Events</c>.
/// </summary>
public class PluginEvents
{
    private readonly string _pluginName;
    private BSBEvents? _eventsBackend;

    /// <summary>
    /// Create a new PluginEvents wrapper for the given plugin name.
    /// The backend is set later by the framework via <see cref="SetBackend"/>.
    /// </summary>
    /// <param name="pluginName">The owning plugin's name.</param>
    internal PluginEvents(string pluginName)
    {
        _pluginName = pluginName;
    }

    /// <summary>
    /// Wire up the underlying events backend. Called by the framework during plugin wiring.
    /// </summary>
    /// <param name="backend">The events plugin implementation.</param>
    internal void SetBackend(BSBEvents backend)
    {
        _eventsBackend = backend;
    }

    private BSBEvents Backend =>
        _eventsBackend ?? throw new InvalidOperationException("Events backend not initialized");

    // --- Fire-and-forget ---

    /// <summary>
    /// Register a handler for a fire-and-forget event on this plugin.
    /// </summary>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <param name="handler">The handler to invoke when the event is emitted.</param>
    public Task OnEvent(string eventName, IObservable obs, EventHandler handler)
        => Backend.OnEvent(_pluginName, eventName, obs, handler);

    /// <summary>
    /// Emit a fire-and-forget event from this plugin.
    /// </summary>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <param name="data">Event payload data.</param>
    public Task EmitEvent(string eventName, IObservable obs, object? data = null)
        => Backend.EmitEvent(_pluginName, eventName, obs, data);

    // --- Returnable (request-response) ---

    /// <summary>
    /// Register a handler for a returnable event on this plugin.
    /// </summary>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <param name="handler">The handler that processes the request and returns a response.</param>
    public Task OnReturnableEvent(string eventName, IObservable obs, ReturnableEventHandler handler)
        => Backend.OnReturnableEvent(_pluginName, eventName, obs, handler);

    /// <summary>
    /// Emit a returnable event and wait for a response.
    /// </summary>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <param name="data">Request payload data.</param>
    /// <param name="timeoutSeconds">Maximum time to wait for a response.</param>
    /// <returns>The response from the handler.</returns>
    public Task<object?> EmitEventAndReturn(string eventName, IObservable obs, object? data = null, int timeoutSeconds = 30)
        => Backend.EmitEventAndReturn(_pluginName, eventName, obs, data, timeoutSeconds);

    // --- Broadcast ---

    /// <summary>
    /// Register a handler for a broadcast event on this plugin.
    /// </summary>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <param name="handler">The handler to invoke for each broadcast.</param>
    public Task OnBroadcast(string eventName, IObservable obs, BroadcastHandler handler)
        => Backend.OnBroadcast(_pluginName, eventName, obs, handler);

    /// <summary>
    /// Emit a broadcast event to all registered handlers.
    /// </summary>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <param name="data">Broadcast payload data.</param>
    public Task EmitBroadcast(string eventName, IObservable obs, object? data = null)
        => Backend.EmitBroadcast(_pluginName, eventName, obs, data);

    // --- Streams ---

    /// <summary>
    /// Open a stream to receive data from a named event channel.
    /// </summary>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <returns>A readable stream of incoming data.</returns>
    public Task<Stream> ReceiveStream(string eventName, IObservable obs)
        => Backend.ReceiveStream(_pluginName, eventName, obs);

    /// <summary>
    /// Send a stream of data to a named event channel.
    /// </summary>
    /// <param name="eventName">The event name.</param>
    /// <param name="obs">Observable for tracing.</param>
    /// <param name="data">The stream of data to send.</param>
    public Task SendStream(string eventName, IObservable obs, Stream data)
        => Backend.SendStream(_pluginName, eventName, obs, data);
}
