namespace BSB.Base;

using BSB.Interfaces;

/// <summary>Plugin-scoped event API with AnyVali validation on both sides of every call.</summary>
public class PluginEvents
{
    private readonly string _pluginName;
    private BSBEvents? _backend;
    private readonly Func<BSBEvents>? _resolveBackend;
    private Dictionary<(string Category, string Name), (BSBType Input, BSBType? Output)>? _schemas;

    internal PluginEvents(string pluginName, Func<BSBEvents>? resolveBackend = null)
    {
        _pluginName = pluginName;
        _resolveBackend = resolveBackend;
    }
    internal void SetBackend(BSBEvents backend) => _backend = backend;
    private BSBEvents Backend => _resolveBackend?.Invoke() ?? _backend
        ?? throw new InvalidOperationException("Events backend not initialized");

    internal void SetSchemas(BSBEventSchemas? schemas)
    {
        _schemas = schemas?.Export(_pluginName, "0.0.0").Events.ToDictionary(
            p => (p.Value.Category, p.Key),
            p => (BSBType.Import(p.Value.InputSchema!), p.Value.OutputSchema is null ? null : BSBType.Import(p.Value.OutputSchema)));
    }

    /// <summary>Create a client in the service constructor; its backend is resolved when used.</summary>
    public PluginEvents CreateClient(string targetPlugin, EventSchemaExport schema)
    {
        var client = new PluginEvents(targetPlugin, () => Backend);
        client.SetSchemas(BSBEventSchemas.Import(schema, client: true));
        return client;
    }

    private (BSBType? Input, BSBType? Output) Schema(string category, string name)
    {
        if (_schemas is null) return (null, null);
        if (!_schemas.TryGetValue((category, name), out var schema))
            throw new InvalidOperationException($"Undeclared event {_pluginName}.{name} in {category}");
        return schema;
    }
    private static object? Parse(BSBType? schema, object? value) => schema is null ? value : schema.Parse(value);

    public Task OnEvent(string eventName, IObservable obs, EventHandler handler)
    {
        var schema = Schema("onEvents", eventName);
        return Backend.OnEvent(_pluginName, eventName, obs, (trace, data) => handler(trace, Parse(schema.Input, data)));
    }
    public Task EmitEvent(string eventName, IObservable obs, object? data = null)
        => Backend.EmitEvent(_pluginName, eventName, obs, Parse(Schema("emitEvents", eventName).Input, data));

    public Task OnReturnableEvent(string eventName, IObservable obs, ReturnableEventHandler handler)
    {
        var schema = Schema("onReturnableEvents", eventName);
        return Backend.OnReturnableEvent(_pluginName, eventName, obs,
            async (trace, data) => Parse(schema.Output, await handler(trace, Parse(schema.Input, data))));
    }
    public async Task<object?> EmitEventAndReturn(string eventName, IObservable obs, object? data = null, double timeoutSeconds = 30)
    {
        BSBEvents.TimeoutDuration(timeoutSeconds);
        var schema = Schema("emitReturnableEvents", eventName);
        return Parse(schema.Output, await Backend.EmitEventAndReturn(_pluginName, eventName, obs, Parse(schema.Input, data), timeoutSeconds));
    }
    public Task OnBroadcast(string eventName, IObservable obs, BroadcastHandler handler)
    {
        var schema = Schema("onBroadcast", eventName);
        return Backend.OnBroadcast(_pluginName, eventName, obs, (trace, data) => handler(trace, Parse(schema.Input, data)));
    }
    public Task EmitBroadcast(string eventName, IObservable obs, object? data = null)
        => Backend.EmitBroadcast(_pluginName, eventName, obs, Parse(Schema("emitBroadcast", eventName).Input, data));
    public Task<Stream> ReceiveStream(string eventName, IObservable obs) => Backend.ReceiveStream(_pluginName, eventName, obs);
    public Task SendStream(string eventName, IObservable obs, Stream data) => Backend.SendStream(_pluginName, eventName, obs, data);
    public Task<string> ReceiveStream(string eventName, IObservable obs, StreamHandler handler, int timeoutSeconds = 5) =>
        Backend.ReceiveStream(_pluginName, eventName, obs, handler, timeoutSeconds);
    public Task SendStream(string eventName, IObservable obs, string streamId, Stream data) =>
        Backend.SendStream(_pluginName, eventName, obs, streamId, data);

    public Task OnEventSpecific(string serverId, string eventName, IObservable obs, EventHandler handler)
    {
        var schema = Schema("onEvents", eventName);
        return Backend.OnEvent(_pluginName, Specific(eventName, serverId), obs, (trace, data) => handler(trace, Parse(schema.Input, data)));
    }
    public Task EmitEventSpecific(string serverId, string eventName, IObservable obs, object? data = null) =>
        Backend.EmitEvent(_pluginName, Specific(eventName, serverId), obs, Parse(Schema("emitEvents", eventName).Input, data));
    public Task OnReturnableEventSpecific(string serverId, string eventName, IObservable obs, ReturnableEventHandler handler)
    {
        var schema = Schema("onReturnableEvents", eventName);
        return Backend.OnReturnableEvent(_pluginName, Specific(eventName, serverId), obs,
            async (trace, data) => Parse(schema.Output, await handler(trace, Parse(schema.Input, data))));
    }
    public async Task<object?> EmitEventAndReturnSpecific(string serverId, string eventName, IObservable obs, object? data = null, double timeoutSeconds = 30)
    {
        BSBEvents.TimeoutDuration(timeoutSeconds);
        var schema = Schema("emitReturnableEvents", eventName);
        return Parse(schema.Output, await Backend.EmitEventAndReturn(_pluginName, Specific(eventName, serverId), obs, Parse(schema.Input, data), timeoutSeconds));
    }
    private static string Specific(string name, string serverId) => !string.IsNullOrWhiteSpace(serverId) && !serverId.Contains('\0')
        ? $"{name}-{serverId}" : throw new ArgumentException("Server ID is required", nameof(serverId));
}
