using BSB.Base;
using BSB.Interfaces;
using System.Collections.Concurrent;

/// <summary>
/// Default in-process event routing plugin. Maintains handler registrations
/// and dispatches events between plugins locally within a single process.
/// </summary>
public class Plugin : BSBEvents
{
    private readonly ConcurrentDictionary<string, List<BSB.Base.EventHandler>> _eventHandlers = new();
    private readonly ConcurrentDictionary<string, BSB.Base.ReturnableEventHandler> _returnableHandlers = new();
    private readonly ConcurrentDictionary<string, List<BroadcastHandler>> _broadcastHandlers = new();
    private readonly ConcurrentDictionary<string, TaskCompletionSource<Stream>> _streamSources = new();

    public Plugin(PluginConstructorArgs args) : base(args) { }

    // --- Fire-and-forget ---

    public override Task OnEvent(string pluginName, string eventName, IObservable obs, BSB.Base.EventHandler handler)
    {
        _eventHandlers.AddOrUpdate(
            eventName,
            _ => new List<BSB.Base.EventHandler> { handler },
            (_, list) => { lock (list) { list.Add(handler); } return list; });
        return Task.CompletedTask;
    }

    public override async Task EmitEvent(string pluginName, string eventName, IObservable obs, object? data)
    {
        if (_eventHandlers.TryGetValue(eventName, out var handlers))
        {
            BSB.Base.EventHandler? handler;
            lock (handlers) { handler = handlers.Count > 0 ? handlers[0] : null; }
            if (handler is not null)
                await handler(obs, data);
        }
    }

    // --- Returnable ---

    public override Task OnReturnableEvent(string pluginName, string eventName, IObservable obs, BSB.Base.ReturnableEventHandler handler)
    {
        _returnableHandlers[eventName] = handler;
        return Task.CompletedTask;
    }

    public override async Task<object?> EmitEventAndReturn(string pluginName, string eventName, IObservable obs, object? data, int timeoutSeconds = 30)
    {
        if (!_returnableHandlers.TryGetValue(eventName, out var handler))
            throw new BSBError($"No handler registered for returnable event '{eventName}'", obs.Trace, pluginName);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSeconds));
        var handlerTask = handler(obs, data);
        var completedTask = await Task.WhenAny(handlerTask, Task.Delay(Timeout.Infinite, cts.Token));

        if (completedTask != handlerTask)
            throw new TimeoutException($"Returnable event '{eventName}' timed out after {timeoutSeconds}s");

        return await handlerTask;
    }

    // --- Broadcast ---

    public override Task OnBroadcast(string pluginName, string eventName, IObservable obs, BroadcastHandler handler)
    {
        _broadcastHandlers.AddOrUpdate(
            eventName,
            _ => new List<BroadcastHandler> { handler },
            (_, list) => { lock (list) { list.Add(handler); } return list; });
        return Task.CompletedTask;
    }

    public override async Task EmitBroadcast(string pluginName, string eventName, IObservable obs, object? data)
    {
        if (_broadcastHandlers.TryGetValue(eventName, out var handlers))
        {
            BroadcastHandler[] snapshot;
            lock (handlers) { snapshot = handlers.ToArray(); }
            await Task.WhenAll(snapshot.Select(h => h(obs, data)));
        }
    }

    // --- Streams ---

    public override Task<Stream> ReceiveStream(string pluginName, string eventName, IObservable obs)
    {
        var tcs = new TaskCompletionSource<Stream>(TaskCreationOptions.RunContinuationsAsynchronously);
        _streamSources[eventName] = tcs;
        return tcs.Task;
    }

    public override Task SendStream(string pluginName, string eventName, IObservable obs, Stream data)
    {
        if (_streamSources.TryRemove(eventName, out var tcs))
            tcs.SetResult(data);
        return Task.CompletedTask;
    }
}
