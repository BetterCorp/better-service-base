namespace BSB.Runtime;

using BSB.Base;
using BSB.Interfaces;

/// <summary>
/// Configuration subsystem. Manages the active config plugin and delegates
/// plugin discovery and per-plugin configuration queries to it.
/// Only one config plugin is active per application host.
/// </summary>
internal class SBConfig : IAsyncDisposable
{
    private BSBConfig? _configPlugin;

    /// <summary>
    /// The active config plugin instance.
    /// </summary>
    public BSBConfig Plugin => _configPlugin
        ?? throw new InvalidOperationException("Config plugin not initialized");

    /// <summary>
    /// Initialize the config subsystem with the given plugin instance.
    /// </summary>
    /// <param name="configPlugin">The config plugin to use.</param>
    /// <param name="obs">Observable for logging during initialization.</param>
    public async Task Init(BSBConfig configPlugin, IObservable obs)
    {
        _configPlugin = configPlugin;
        await _configPlugin.Init(obs);
    }

    /// <summary>
    /// Get the set of observable plugins to load.
    /// </summary>
    public Task<Dictionary<string, PluginDefinition>> GetObservablePlugins(IObservable obs)
        => Plugin.GetObservablePlugins(obs);

    /// <summary>
    /// Get the set of events plugins to load.
    /// </summary>
    public Task<Dictionary<string, PluginDefinition>> GetEventsPlugins(IObservable obs)
        => Plugin.GetEventsPlugins(obs);

    /// <summary>
    /// Get the set of service plugins to load.
    /// </summary>
    public Task<Dictionary<string, PluginDefinition>> GetServicePlugins(IObservable obs)
        => Plugin.GetServicePlugins(obs);

    /// <summary>
    /// Get configuration for a specific plugin by type and name.
    /// </summary>
    public Task<object?> GetPluginConfig(IObservable obs, PluginType type, string name)
        => Plugin.GetPluginConfig(obs, type, name);

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        GC.SuppressFinalize(this);
        if (_configPlugin is not null)
            await _configPlugin.DisposeAsync();
    }
}
