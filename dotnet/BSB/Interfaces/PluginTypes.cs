namespace BSB.Interfaces;

/// <summary>
/// The category of a BSB plugin.
/// </summary>
public enum PluginType
{
    /// <summary>
    /// Configuration provider plugin.
    /// </summary>
    Config,

    /// <summary>
    /// Observability provider plugin (logging, metrics, tracing).
    /// </summary>
    Observable,

    /// <summary>
    /// Event transport plugin (inter-service communication).
    /// </summary>
    Events,

    /// <summary>
    /// Service plugin (business logic).
    /// </summary>
    Service,

    /// <summary>
    /// Generated client for calling another service's events.
    /// </summary>
    ServiceClient
}

/// <summary>
/// Metadata describing a BSB plugin for registry and documentation.
/// </summary>
public class BSBPluginMetadata
{
    /// <summary>
    /// Unique plugin name (typically the package/assembly name).
    /// </summary>
    public required string Name { get; init; }

    /// <summary>
    /// Human-readable description of the plugin.
    /// </summary>
    public required string Description { get; init; }

    /// <summary>
    /// Plugin version (semver).
    /// </summary>
    public string? Version { get; init; }

    /// <summary>
    /// Plugin author.
    /// </summary>
    public string? Author { get; init; }

    /// <summary>
    /// License identifier (e.g. "MIT").
    /// </summary>
    public string? License { get; init; }

    /// <summary>
    /// Plugin category.
    /// </summary>
    public PluginType Category { get; init; } = PluginType.Service;

    /// <summary>
    /// Tags for search and categorization.
    /// </summary>
    public string[]? Tags { get; init; }

    /// <summary>
    /// Documentation URLs or paths.
    /// </summary>
    public string[]? Documentation { get; init; }

    /// <summary>
    /// Container image reference for the plugin.
    /// </summary>
    public string? Image { get; init; }

    /// <summary>
    /// Plugins that must initialize before this plugin.
    /// Purely informational for ordering - not dependency resolution.
    /// </summary>
    public string[]? InitBeforePlugins { get; init; }

    /// <summary>
    /// Plugins that must initialize after this plugin.
    /// Purely informational for ordering - not dependency resolution.
    /// </summary>
    public string[]? InitAfterPlugins { get; init; }

    /// <summary>
    /// Plugins that must run before this plugin.
    /// Purely informational for ordering - not dependency resolution.
    /// </summary>
    public string[]? RunBeforePlugins { get; init; }

    /// <summary>
    /// Plugins that must run after this plugin.
    /// Purely informational for ordering - not dependency resolution.
    /// </summary>
    public string[]? RunAfterPlugins { get; init; }
}

/// <summary>
/// Definition for a plugin to be loaded by the service runner.
/// Maps a config key (mapped name) to an actual plugin name and optional package.
/// </summary>
public class PluginDefinition
{
    /// <summary>
    /// The mapped name (config key). This is how the plugin is referenced in config.
    /// </summary>
    public required string Name { get; init; }

    /// <summary>
    /// The actual plugin name used to locate the plugin on disk.
    /// If null, defaults to Name.
    /// </summary>
    public string? Plugin { get; init; }

    /// <summary>
    /// The assembly/package name containing this plugin. If null, the plugin is local
    /// (searched in the cwd plugins directory).
    /// </summary>
    public string? Package { get; init; }

    /// <summary>
    /// Semver version selector for the plugin (e.g. "1.0", "1.0.3").
    /// If null, the latest available version is used.
    /// </summary>
    public string? Version { get; init; }

    /// <summary>
    /// Whether the plugin is enabled for this deployment.
    /// </summary>
    public bool Enabled { get; init; } = true;

    /// <summary>
    /// The resolved plugin name (Plugin if set, otherwise Name).
    /// </summary>
    public string ResolvedPluginName => Plugin ?? Name;
}

/// <summary>
/// Constructor parameters passed to plugin instances during creation.
/// </summary>
public class PluginConstructorArgs
{
    /// <summary>
    /// Application instance identifier.
    /// </summary>
    public required string AppId { get; init; }

    /// <summary>
    /// Runtime debug mode.
    /// </summary>
    public required DebugMode Mode { get; init; }

    /// <summary>
    /// Name of the plugin being constructed.
    /// </summary>
    public required string PluginName { get; init; }

    /// <summary>
    /// Current working directory for the service.
    /// </summary>
    public required string Cwd { get; init; }

    /// <summary>
    /// Optional deployment region identifier.
    /// </summary>
    public string? Region { get; init; }
}

/// <summary>
/// Constructor parameters for service plugins, including typed configuration.
/// </summary>
/// <typeparam name="TConfig">The plugin's configuration type.</typeparam>
public class ServiceConstructorArgs<TConfig> : PluginConstructorArgs
{
    /// <summary>
    /// The validated configuration object for this plugin.
    /// </summary>
    public required TConfig Config { get; init; }
}
