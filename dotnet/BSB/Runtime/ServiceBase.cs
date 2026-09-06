namespace BSB.Runtime;

using BSB.Base;
using BSB.Interfaces;
using System.Runtime.InteropServices;

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
    private readonly SBEvents _events;
    private readonly string _appId;
    private readonly SBServices _services = new();
    private readonly CancellationTokenSource _shutdownCts = new();
    private readonly ServiceBaseOptions _options;
    private bool _disposed;
    private readonly PosixSignalRegistration? _sigterm;

    private ServiceBase(ServiceBaseOptions options)
    {
        _options = options;
        _plugins = new SBPlugins(options.Cwd);
        _appId = options.AppId ?? Guid.NewGuid().ToString("N")[..12];
        _events = new SBEvents(MakeArgs(_appId, "events-router"));
        Console.CancelKeyPress += OnCancelKeyPress;
        AppDomain.CurrentDomain.ProcessExit += OnProcessExit;
        if (!OperatingSystem.IsWindows())
            _sigterm = PosixSignalRegistration.Create(PosixSignal.SIGTERM, context => { context.Cancel = true; _shutdownCts.Cancel(); });
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
        var appId = _appId;
        var version = typeof(ServiceBase).Assembly.GetName().Version?.ToString() ?? "unknown";
        Console.Error.WriteLine($"BSB startup: runtime {version}, loading configuration");

        _observable.SetResource(new ResourceContext
        {
            ServiceName = "service-base",
            ServiceVersion = version,
            ServiceInstanceId = appId,
            DeploymentEnvironment = _options.Mode.ToString().ToLowerInvariant(),
            DeploymentRegion = _options.Region,
        });

        // --- 1. Load config plugin from disk ---
        // Config is always loaded first (bootstrap). It tells us what else to load.
        var configDef = _options.ConfigPlugin ?? new PluginDefinition {
            Name = Environment.GetEnvironmentVariable("BSB_CONFIG_PLUGIN") ?? "config-default",
            Package = Environment.GetEnvironmentVariable("BSB_CONFIG_PLUGIN_PACKAGE"), Enabled = true };
        var configArgs = MakeArgs(appId, configDef.Name, _options.Config);
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
        bootObs.Log.Info("BSB Service Base {version} initializing", new LogMeta { ["version"] = version });
        bootObs.Log.Info("Config plugin loaded: {plugin}", new LogMeta { ["plugin"] = configDef.Name });
        bootObs.Log.Info("Observable plugins initialized");

        // --- 3. Load events plugins from config ---
        var eventsPlugins = await _config.GetEventsPlugins(bootObs);
        foreach (var (name, def) in eventsPlugins)
        {
            if (!def.Enabled) continue;
            var eventConfig = await _config.GetPluginConfig(bootObs, PluginType.Events, name);
            var instance = _plugins.CreateEventsInstance(def, MakeArgs(appId, name, eventConfig));
            _events.AddPlugin(instance, def.Filter);
        }
        if (!_events.HasUnfilteredPlugin)
            _events.AddPlugin(_plugins.CreateEventsInstance(new PluginDefinition { Name = "_local_fallback", Plugin = "events-default" }, MakeArgs(appId, "_local_fallback")));
        await _events.Init(bootObs);
        bootObs.Log.Info("Events plugins initialized");

        // --- 4. Load service plugins from config ---
        var servicePlugins = await _config.GetServicePlugins(bootObs);
        _events.SetServices(servicePlugins);
        foreach (var (name, def) in servicePlugins)
        {
            if (!def.Enabled) continue;
            var svcConfig = await _config.GetPluginConfig(bootObs, PluginType.Service, name);
            var instance = _plugins.CreateServiceInstance(def, MakeArgs(appId, name), svcConfig);
            var metadata = _plugins.GetMetadata(def);
            _services.AddService(name, instance, metadata);
        }

        // --- 5. Init services in dependency order ---
        if (_events.HasPlugins)
        {
            await _services.Init(_observable, _events);
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

        await _observable.Run(obs);

        if (_events.HasPlugins)
            await _events.Run(obs);
        await _services.Run(_observable);

        obs.Log.Info("All services running");
        obs.End();

    }

    /// <summary>
    /// Wait for a shutdown signal (Ctrl+C / SIGTERM). Once signaled,
    /// disposes all plugins in reverse order.
    /// </summary>
    public async Task WaitForShutdown()
    {
        try
        {
            await await Task.WhenAny(Task.Delay(Timeout.Infinite, _shutdownCts.Token), _events.Completion);
        }
        catch (OperationCanceledException) { }

        var obs = _observable.CreateObservable("service-base", "shutdown");
        obs.Log.Info("Shutdown signal received, disposing services");
        await DisposeAsync();
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;
        _sigterm?.Dispose();
        _shutdownCts.Cancel();
        Console.CancelKeyPress -= OnCancelKeyPress;
        AppDomain.CurrentDomain.ProcessExit -= OnProcessExit;
        GC.SuppressFinalize(this);

        List<Exception> errors = new();
        foreach (var subsystem in new IAsyncDisposable[] { _services, _events, _observable, _config })
            try { await subsystem.DisposeAsync(); } catch (Exception error) { errors.Add(error); }
        _shutdownCts.Dispose();
        if (errors.Count > 0) throw new AggregateException(errors);
    }

    private void OnCancelKeyPress(object? sender, ConsoleCancelEventArgs args)
    {
        args.Cancel = true;
        _shutdownCts.Cancel();
    }

    private void OnProcessExit(object? sender, EventArgs args) => _shutdownCts.Cancel();

    private PluginConstructorArgs MakeArgs(string appId, string pluginName, object? config = null) => new()
    {
        AppId = appId,
        Mode = _options.Mode,
        PluginName = pluginName,
        Cwd = _options.Cwd,
        Region = _options.Region,
        RawConfig = config,
    };
}

/// <summary>
/// Options for creating a <see cref="ServiceBase"/> instance.
/// </summary>
public class ServiceBaseOptions
{
    public PluginDefinition? ConfigPlugin { get; init; }
    public object? Config { get; init; }
    public required string Cwd { get; init; }
    public DebugMode Mode { get; init; } = DebugMode.Development;
    public string? AppId { get; init; }
    public string? Region { get; init; }
}
