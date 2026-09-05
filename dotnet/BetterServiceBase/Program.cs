using BSB.Runtime;

// BSB Service Base -- the plugin container.
// Plugins are loaded dynamically from config (bsb-config.json).
// No plugins are referenced here. BSB discovers and loads them at runtime.

await using var service = ServiceBase.Create(new ServiceBaseOptions
{
    Cwd = Directory.GetCurrentDirectory(),
    Mode = Environment.GetEnvironmentVariable("BSB_MODE") == "production"
        ? BSB.Interfaces.DebugMode.Production : BSB.Interfaces.DebugMode.Development,
    AppId = Environment.GetEnvironmentVariable("BSB_APP_ID"),
    Region = Environment.GetEnvironmentVariable("BSB_REGION"),
});

await service.Init();
await service.Run();
await service.WaitForShutdown();
