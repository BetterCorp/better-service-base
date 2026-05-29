using BSB.Runtime;

// BSB Service Base -- the plugin container.
// Plugins are loaded dynamically from config (bsb-config.json).
// No plugins are referenced here. BSB discovers and loads them at runtime.

var service = ServiceBase.Create(new ServiceBaseOptions
{
    Cwd = Directory.GetCurrentDirectory(),
});

await service.Init();
await service.Run();
await service.WaitForShutdown();
