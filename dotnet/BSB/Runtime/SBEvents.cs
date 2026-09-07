namespace BSB.Runtime;

using BSB.Base;
using BSB.Interfaces;
using System.Text.Json;
using EventHandler = BSB.Base.EventHandler;

/// <summary>Routes each operation to the first backend whose filter matches, as in Node.</summary>
internal class SBEvents(PluginConstructorArgs args) : BSBEvents(args)
{
    private readonly List<(BSBEvents Plugin, JsonElement? Filter)> _plugins = new();
    private Dictionary<string, PluginDefinition> _services = new();
    public bool HasPlugins => _plugins.Count > 0;
    public bool HasUnfilteredPlugin => _plugins.Any(x => x.Filter is null || x.Filter.Value.ValueKind == JsonValueKind.Null);
    public override Task Completion => HasPlugins ? Task.WhenAny(_plugins.Select(x => x.Plugin.Completion)).Unwrap() : base.Completion;
    public void AddPlugin(BSBEvents plugin, JsonElement? filter = null)
    {
        ValidateFilter(filter);
        _plugins.Add((plugin, filter));
    }
    private static void ValidateFilter(JsonElement? filter)
    {
        if (filter is null || filter.Value.ValueKind == JsonValueKind.Null) return;
        var value = filter.Value;
        if (value.ValueKind == JsonValueKind.Array)
        {
            if (value.EnumerateArray().Any(x => x.ValueKind != JsonValueKind.String)) throw new InvalidOperationException("Invalid events filter operation list");
            return;
        }
        if (value.ValueKind != JsonValueKind.Object) throw new InvalidOperationException("Invalid events filter");
        foreach (var property in value.EnumerateObject())
        {
            var entry = property.Value;
            if (entry.ValueKind is JsonValueKind.True or JsonValueKind.False) continue;
            if (entry.ValueKind == JsonValueKind.Object)
            {
                if (!entry.TryGetProperty("enabled", out var enabled) || enabled.ValueKind is not (JsonValueKind.True or JsonValueKind.False) ||
                    !entry.TryGetProperty("plugins", out entry)) throw new InvalidOperationException("Invalid events filter plugin selector");
            }
            if (entry.ValueKind != JsonValueKind.Array || entry.EnumerateArray().Any(x => x.ValueKind != JsonValueKind.String))
                throw new InvalidOperationException("Invalid events filter plugin list");
        }
    }
    public void SetServices(Dictionary<string, PluginDefinition> services) => _services = services;
    private string Target(string plugin)
    {
        if (_services.ContainsKey(plugin)) return plugin;
        var matches = _services.Values.Where(x => x.ResolvedPluginName == plugin).Select(x => (x.Name, x.Enabled)).ToArray();
        var active = matches.Where(x => x.Enabled).Select(x => x.Name).ToArray();
        if (active.Length > 1) throw new InvalidOperationException($"Service reference {plugin} is ambiguous; use its profile alias");
        if (active.Length == 1) return active[0];
        if (matches.Length > 1) throw new InvalidOperationException($"Service reference {plugin} is ambiguous; use its profile alias");
        return matches.FirstOrDefault().Name ?? plugin;
    }

    private BSBEvents Route(string operation, string plugin) => _plugins.FirstOrDefault(x => Matches(x.Filter, operation, Target(plugin))).Plugin
        ?? throw new InvalidOperationException($"No events backend matches {operation} for {plugin}");

    internal static bool Matches(JsonElement? filter, string operation, string plugin)
    {
        if (filter is null || filter.Value.ValueKind == JsonValueKind.Null) return true;
        var value = filter.Value;
        if (value.ValueKind == JsonValueKind.Array) return value.EnumerateArray().Any(x => x.GetString() == operation);
        if (value.ValueKind != JsonValueKind.Object) throw new InvalidOperationException("Invalid events filter");
        if (!value.TryGetProperty(operation, out var entry)) return false;
        if (entry.ValueKind == JsonValueKind.True) return true;
        if (entry.ValueKind == JsonValueKind.False) return false;
        if (entry.ValueKind == JsonValueKind.Object)
        {
            if (!entry.TryGetProperty("enabled", out var enabled) || enabled.ValueKind != JsonValueKind.True) return false;
            if (!entry.TryGetProperty("plugins", out entry)) return false;
        }
        if (entry.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("Invalid events filter plugin list");
        return entry.EnumerateArray().Any(x => x.GetString() == plugin);
    }

    public override async Task Init(IObservable obs) { foreach (var (plugin, _) in _plugins) await plugin.Init(obs); }
    public override async Task Run(IObservable obs) { foreach (var (plugin, _) in _plugins) await plugin.Run(obs); }
    public override async ValueTask DisposeAsync()
    {
        List<Exception> errors = new();
        foreach (var (plugin, _) in _plugins.AsEnumerable().Reverse())
            try { await plugin.DisposeAsync(); } catch (Exception error) { errors.Add(error); }
        if (errors.Count > 0) throw new AggregateException(errors);
    }
    public override Task OnEvent(string plugin, string name, IObservable obs, EventHandler handler)
        => Route("onEvent", plugin).OnEvent(Target(plugin), name, obs, handler);
    public override Task EmitEvent(string plugin, string name, IObservable obs, object? data)
        => Route("emitEvent", plugin).EmitEvent(Target(plugin), name, obs, data);
    public override Task OnReturnableEvent(string plugin, string name, IObservable obs, ReturnableEventHandler handler)
        => Route("onReturnableEvent", plugin).OnReturnableEvent(Target(plugin), name, obs, handler);
    public override Task<object?> EmitEventAndReturn(string plugin, string name, IObservable obs, object? data, int timeoutSeconds = 30)
        => Route("emitEventAndReturn", plugin).EmitEventAndReturn(Target(plugin), name, obs, data, timeoutSeconds);
    public override Task OnBroadcast(string plugin, string name, IObservable obs, BroadcastHandler handler)
        => Route("onBroadcast", plugin).OnBroadcast(Target(plugin), name, obs, handler);
    public override Task EmitBroadcast(string plugin, string name, IObservable obs, object? data)
        => Route("emitBroadcast", plugin).EmitBroadcast(Target(plugin), name, obs, data);
    public override Task<Stream> ReceiveStream(string plugin, string name, IObservable obs)
        => Route("receiveStream", plugin).ReceiveStream(Target(plugin), name, obs);
    public override Task SendStream(string plugin, string name, IObservable obs, Stream data)
        => Route("sendStream", plugin).SendStream(Target(plugin), name, obs, data);
    public override Task<string> ReceiveStream(string plugin, string name, IObservable obs, StreamHandler handler, int timeoutSeconds = 5)
        => Route("receiveStream", plugin).ReceiveStream(Target(plugin), name, obs, handler, timeoutSeconds);
    public override Task SendStream(string plugin, string name, IObservable obs, string streamId, Stream data)
        => Route("sendStream", plugin).SendStream(Target(plugin), name, obs, streamId, data);
}
