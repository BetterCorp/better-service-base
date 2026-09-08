using BSB.Base;
using BSB.Interfaces;
using System.Collections.Concurrent;
using System.Threading.Channels;

namespace BSB.Plugins.EventsDefault;

/// <summary>
/// Default in-process event routing plugin. Maintains handler registrations
/// and dispatches events between plugins locally within a single process.
/// </summary>
public class Plugin : BSBEvents
{
    private readonly ConcurrentDictionary<(string Plugin, string Event), List<BSB.Base.EventHandler>> _eventHandlers = new();
    private readonly ConcurrentDictionary<(string Plugin, string Event), BSB.Base.ReturnableEventHandler> _returnableHandlers = new();
    private readonly ConcurrentDictionary<(string Plugin, string Event), List<BroadcastHandler>> _broadcastHandlers = new();
    private readonly ConcurrentDictionary<(string Plugin, string Event), Channel<Stream>> _streamSources = new();
    private readonly CancellationTokenSource _shutdown = new();
    private int _disposed;

    public Plugin(PluginConstructorArgs args) : base(args) { }

    // --- Fire-and-forget ---

    public override Task OnEvent(string pluginName, string eventName, IObservable obs, BSB.Base.EventHandler handler)
    {
        ObjectDisposedException.ThrowIf(_disposed != 0, this);
        _eventHandlers.AddOrUpdate(
            (pluginName, eventName),
            _ => new List<BSB.Base.EventHandler> { handler },
            (_, list) => { lock (list) { list.Add(handler); } return list; });
        return Task.CompletedTask;
    }

    public override async Task EmitEvent(string pluginName, string eventName, IObservable obs, object? data)
    {
        ObjectDisposedException.ThrowIf(_disposed != 0, this);
        if (_eventHandlers.TryGetValue((pluginName, eventName), out var handlers))
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
        ObjectDisposedException.ThrowIf(_disposed != 0, this);
        if (!_returnableHandlers.TryAdd((pluginName, eventName), handler))
            throw new InvalidOperationException($"Returnable handler already registered: {pluginName}.{eventName}");
        return Task.CompletedTask;
    }

    public override async Task<object?> EmitEventAndReturn(string pluginName, string eventName, IObservable obs, object? data, double timeoutSeconds = 30)
    {
        ObjectDisposedException.ThrowIf(_disposed != 0, this);
        var timeout = TimeoutDuration(timeoutSeconds);
        if (!_returnableHandlers.TryGetValue((pluginName, eventName), out var handler))
            throw new BSBError($"No handler registered for returnable event '{eventName}'", obs.Trace, pluginName);

        return await handler(obs, data).WaitAsync(timeout, _shutdown.Token);
    }

    // --- Broadcast ---

    public override Task OnBroadcast(string pluginName, string eventName, IObservable obs, BroadcastHandler handler)
    {
        ObjectDisposedException.ThrowIf(_disposed != 0, this);
        _broadcastHandlers.AddOrUpdate(
            (pluginName, eventName),
            _ => new List<BroadcastHandler> { handler },
            (_, list) => { lock (list) { list.Add(handler); } return list; });
        return Task.CompletedTask;
    }

    public override async Task EmitBroadcast(string pluginName, string eventName, IObservable obs, object? data)
    {
        ObjectDisposedException.ThrowIf(_disposed != 0, this);
        if (_broadcastHandlers.TryGetValue((pluginName, eventName), out var handlers))
        {
            BroadcastHandler[] snapshot;
            lock (handlers) { snapshot = handlers.ToArray(); }
            await Task.WhenAll(snapshot.Select(h => h(obs, data)));
        }
    }

    // --- Streams ---

    public override async Task<Stream> ReceiveStream(string pluginName, string eventName, IObservable obs)
    {
        ObjectDisposedException.ThrowIf(_disposed != 0, this);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(_shutdown.Token);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        return await StreamChannel(pluginName, eventName).Reader.ReadAsync(timeout.Token);
    }

    public override async Task SendStream(string pluginName, string eventName, IObservable obs, Stream data)
    {
        ObjectDisposedException.ThrowIf(_disposed != 0, this);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(_shutdown.Token);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        await StreamChannel(pluginName, eventName).Writer.WriteAsync(data, timeout.Token);
    }

    private Channel<Stream> StreamChannel(string plugin, string name) => _streamSources.GetOrAdd((plugin, name),
        _ => Channel.CreateBounded<Stream>(new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.Wait }));

    public override ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return ValueTask.CompletedTask;
        _shutdown.Cancel();
        foreach (var channel in _streamSources.Values)
        {
            channel.Writer.TryComplete();
            // Queued streams remain owned by their senders, including during shutdown.
            while (channel.Reader.TryRead(out _)) { }
        }
        _eventHandlers.Clear(); _returnableHandlers.Clear(); _broadcastHandlers.Clear(); _streamSources.Clear();
        _shutdown.Dispose();
        return ValueTask.CompletedTask;
    }
}
