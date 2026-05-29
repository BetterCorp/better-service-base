namespace BSB.Runtime;

using BSB.Base;
using BSB.Interfaces;

/// <summary>
/// Events subsystem. Manages event routing plugin instances.
/// The first registered events plugin is the primary backend used for
/// wiring service plugin event handlers.
/// </summary>
internal class SBEvents : IAsyncDisposable
{
    private readonly List<BSBEvents> _eventsPlugins = new();

    /// <summary>
    /// The primary events plugin used for service event wiring.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// Thrown if no events plugin has been registered.
    /// </exception>
    public BSBEvents Primary => _eventsPlugins.Count > 0
        ? _eventsPlugins[0]
        : throw new InvalidOperationException("No events plugin registered");

    /// <summary>
    /// Whether any events plugins have been registered.
    /// </summary>
    public bool HasPlugins => _eventsPlugins.Count > 0;

    /// <summary>
    /// Add an events plugin to the subsystem.
    /// </summary>
    public void AddPlugin(BSBEvents plugin) => _eventsPlugins.Add(plugin);

    /// <summary>
    /// Initialize all events plugins.
    /// </summary>
    public async Task Init(IObservable obs)
    {
        foreach (var plugin in _eventsPlugins)
            await plugin.Init(obs);
    }

    /// <summary>
    /// Run all events plugins (e.g. start consuming from message queues).
    /// </summary>
    public async Task Run(IObservable obs)
    {
        foreach (var plugin in _eventsPlugins)
            await plugin.Run(obs);
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        GC.SuppressFinalize(this);
        foreach (var plugin in _eventsPlugins)
            await plugin.DisposeAsync();
    }
}
