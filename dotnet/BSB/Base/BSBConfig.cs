namespace BSB.Base;

using BSB.Interfaces;

/// <summary>
/// Abstract base for configuration provider plugins.
/// A config plugin determines which observable, events, and service plugins
/// to load and supplies per-plugin configuration at startup.
/// Only one config plugin is active per application host.
/// </summary>
public abstract class BSBConfig : MainBase
{
    /// <summary>
    /// Construct a new config plugin base.
    /// </summary>
    /// <param name="args">Plugin construction arguments supplied by the framework.</param>
    protected BSBConfig(PluginConstructorArgs args) : base(args) { }

    /// <summary>
    /// Initialize the config plugin (load config files, connect to config stores, etc).
    /// Called once before any other plugins are loaded.
    /// </summary>
    /// <param name="obs">Observable for logging during initialization.</param>
    public virtual Task Init(IObservable obs) => Task.CompletedTask;

    /// <summary>
    /// Get the set of observable plugins to load.
    /// Keys are plugin names, values are their definitions.
    /// </summary>
    /// <param name="obs">Observable for logging.</param>
    /// <returns>Dictionary of observable plugin definitions keyed by name.</returns>
    public abstract Task<Dictionary<string, PluginDefinition>> GetObservablePlugins(IObservable obs);

    /// <summary>
    /// Get the set of events plugins to load.
    /// Keys are plugin names, values are their definitions.
    /// </summary>
    /// <param name="obs">Observable for logging.</param>
    /// <returns>Dictionary of events plugin definitions keyed by name.</returns>
    public abstract Task<Dictionary<string, PluginDefinition>> GetEventsPlugins(IObservable obs);

    /// <summary>
    /// Get the set of service plugins to load.
    /// Keys are plugin names, values are their definitions.
    /// </summary>
    /// <param name="obs">Observable for logging.</param>
    /// <returns>Dictionary of service plugin definitions keyed by name.</returns>
    public abstract Task<Dictionary<string, PluginDefinition>> GetServicePlugins(IObservable obs);

    /// <summary>
    /// Get configuration for a specific plugin by type and name.
    /// Returns null if no configuration is defined.
    /// </summary>
    /// <param name="obs">Observable for logging.</param>
    /// <param name="pluginType">The type of plugin (observable, events, service).</param>
    /// <param name="pluginName">The name of the plugin to get config for.</param>
    /// <returns>The plugin configuration object, or null.</returns>
    public abstract Task<object?> GetPluginConfig(IObservable obs, PluginType pluginType, string pluginName);
}
