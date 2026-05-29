namespace BSB.Runtime;

using BSB.Base;
using BSB.Interfaces;

/// <summary>
/// Main BSB service runner. This is the container that loads and runs plugins.
///
/// BSB is deployed and runs on the server (or in Docker). It reads its config,
/// discovers plugin assemblies on disk, loads them, and runs them.
///
/// Plugin discovery:
///   1. BSB_PLUGIN_DIR env var (versioned external plugin directory)
///   2. {cwd}/plugins/{pluginName}/ (local plugin directory)
///
/// All plugins -- including config, observable, and events -- are external
/// assemblies loaded at runtime. BSB itself contains zero plugin code.
///
/// Bootstrap: config-default is loaded first (from plugins/) so BSB can read
/// the config file that tells it which other plugins to load.
///
/// Lifecycle: Init -> Run -> WaitForShutdown -> Dispose
/// </summary>
public class ServiceBase : IAsyncDisposable
{
    private readonly SBPlugins _plugins;
    private readonly SBConfig _config = new();
    private readonly SBObservable _observable = new();
    private readonly SBEvents _events = new();
    private readonly SBServices _services = new();
    private readonly CancellationTokenSource _shutdownCts = new();
    private readonly ServiceBaseOptions _options;
    private bool _disposed;

    private ServiceBase(ServiceBaseOptions options)
    {
        _options = options;
        _plugins = new SBPlugins(options.Cwd);
    }

    /// <summary>
    /// Create a new service base instance.
    /// </summary>
    public static ServiceBase Create(ServiceBaseOptions options)
    {
        return new ServiceBase(options);
    }

    /// <summary>
    /// Create a development-mode service base.
    /// </summary>
    public static ServiceBase Development(string cwd)
        => Create(new ServiceBaseOptions { Cwd = cwd, Mode = DebugMode.Development });

    /// <summary>
    /// Create a production-mode service base.
    /// </summary>
    public static ServiceBase Production(string cwd)
        => Create(new ServiceBaseOptions { Cwd = cwd, Mode = DebugMode.Production });

    /// <summary>
    /// Initialize the service. Loads config-default plugin from disk, reads the
    /// config file, then discovers and loads all other plugins.
    /// </summary>
    public async Task Init()
    {
        var appId = _options.AppId ?? Guid.NewGuid().ToString("N")[..12];

        _observable.SetResource(new ResourceContext
        {
            ServiceName = "service-base",
            ServiceVersion = "9.0.0",
            ServiceInstanceId = appId,
            DeploymentEnvironment = _options.Mode.ToString().ToLowerInvariant(),
            DeploymentRegion = _options.Region,
        });

        // --- 1. Load config plugin from disk ---
        // Config is always loaded first (bootstrap). It tells us what else to load.
        var configDef = new PluginDefinition { Name = "config-default", Enabled = true };
        var configArgs = MakeArgs(appId, "config-default");
        var configPlugin = _plugins.CreateConfigInstance(configDef, configArgs);
        var bootObs = _observable.CreateObservable("service-base", "boot");
        await _config.Init(configPlugin, bootObs);

        _plugins.SetObservable(bootObs);

        // --- 2. Load observable plugins from config ---
        var observablePlugins = await _config.GetObservablePlugins(bootObs);
        foreach (var (name, def) in observablePlugins)
        {
            if (!def.Enabled) continue;
            var obsConfig = await _config.GetPluginConfig(bootObs, PluginType.Observable, name);
            var instance = _plugins.CreateObservableInstance(def, MakeArgs(appId, name), obsConfig);
            _observable.AddObserver(instance);
        }
        await _observable.Init(bootObs);

        // Now that we have an observable, re-log the boot message
        bootObs.Log.Info("BSB Service Base v9.0.0 initializing");
        bootObs.Log.Info("Config plugin loaded: config-default");
        bootObs.Log.Info("Observable plugins initialized");

        // --- 3. Load events plugins from config ---
        var eventsPlugins = await _config.GetEventsPlugins(bootObs);
        foreach (var (name, def) in eventsPlugins)
        {
            if (!def.Enabled) continue;
            var instance = _plugins.CreateEventsInstance(def, MakeArgs(appId, name));
            _events.AddPlugin(instance);
        }
        await _events.Init(bootObs);
        bootObs.Log.Info("Events plugins initialized");

        // --- 4. Load service plugins from config ---
        var servicePlugins = await _config.GetServicePlugins(bootObs);
        foreach (var (name, def) in servicePlugins)
        {
            if (!def.Enabled) continue;
            var svcConfig = await _config.GetPluginConfig(bootObs, PluginType.Service, name);
            var instance = _plugins.CreateServiceInstance(def, MakeArgs(appId, name), svcConfig);
            var metadata = _plugins.GetMetadata(def.ResolvedPluginName);
            _services.AddService(name, instance, metadata);
        }

        // --- 5. Init services in dependency order ---
        if (_events.HasPlugins)
        {
            await _services.Init(_observable, _events.Primary);
        }
        bootObs.Log.Info("All services initialized");
        bootObs.End();
    }

    /// <summary>
    /// Run the service. Starts all plugins in dependency order and sets up
    /// signal handlers for graceful shutdown.
    /// </summary>
    public async Task Run()
    {
        var obs = _observable.CreateObservable("service-base", "run");
        obs.Log.Info("BSB Service Base running");

        if (_events.HasPlugins)
            await _events.Run(obs);
        await _services.Run(_observable);

        obs.Log.Info("All services running");
        obs.End();

        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            _shutdownCts.Cancel();
        };
        AppDomain.CurrentDomain.ProcessExit += (_, _) => _shutdownCts.Cancel();
    }

    /// <summary>
    /// Wait for a shutdown signal (Ctrl+C / SIGTERM). Once signaled,
    /// disposes all plugins in reverse order.
    /// </summary>
    public async Task WaitForShutdown()
    {
        try
        {
            await Task.Delay(Timeout.Infinite, _shutdownCts.Token);
        }
        catch (OperationCanceledException) { }

        var obs = _observable.CreateObservable("service-base", "shutdown");
        obs.Log.Info("Shutdown signal received, disposing services");
        await DisposeAsync();
        obs.Log.Info("BSB Service Base shut down");
        obs.End();
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;
        GC.SuppressFinalize(this);

        await _services.DisposeAsync();
        await _events.DisposeAsync();
        await _observable.DisposeAsync();
        await _config.DisposeAsync();
        _shutdownCts.Dispose();
    }

    private PluginConstructorArgs MakeArgs(string appId, string pluginName) => new()
    {
        AppId = appId,
        Mode = _options.Mode,
        PluginName = pluginName,
        Cwd = _options.Cwd,
        Region = _options.Region,
    };
}

/// <summary>
/// Options for creating a <see cref="ServiceBase"/> instance.
/// </summary>
public class ServiceBaseOptions
{
    public required string Cwd { get; init; }
    public DebugMode Mode { get; init; } = DebugMode.Development;
    public string? AppId { get; init; }
    public string? Region { get; init; }
}
