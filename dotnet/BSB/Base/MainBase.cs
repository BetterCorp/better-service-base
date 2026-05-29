namespace BSB.Base;

using BSB.Interfaces;

/// <summary>
/// Root base class for all BSB plugins. Provides core identity fields
/// and the async disposal lifecycle hook used during framework shutdown.
/// Every plugin type (config, observable, events, service) inherits from this.
/// </summary>
public abstract class MainBase : IAsyncDisposable
{
    /// <summary>
    /// Unique application identifier shared by all plugins in this host.
    /// </summary>
    public string AppId { get; }

    /// <summary>
    /// Current debug/run mode of the framework.
    /// </summary>
    public DebugMode Mode { get; }

    /// <summary>
    /// The registered name of this plugin instance.
    /// </summary>
    public string PluginName { get; }

    /// <summary>
    /// Working directory for the application.
    /// </summary>
    public string Cwd { get; }

    /// <summary>
    /// Optional deployment region identifier.
    /// </summary>
    public string? Region { get; }

    /// <summary>
    /// Construct a new plugin base from the standard constructor args.
    /// </summary>
    /// <param name="args">Plugin construction arguments supplied by the framework.</param>
    protected MainBase(PluginConstructorArgs args)
    {
        AppId = args.AppId;
        Mode = args.Mode;
        PluginName = args.PluginName;
        Cwd = args.Cwd;
        Region = args.Region;
    }

    /// <summary>
    /// Called during framework shutdown for resource cleanup.
    /// Override to release unmanaged resources, close connections, etc.
    /// </summary>
    public virtual ValueTask DisposeAsync()
    {
        GC.SuppressFinalize(this);
        return ValueTask.CompletedTask;
    }
}
