using BSB.Runtime;
using BSB.Interfaces;
using System.Reflection;

if (args[0] == "--run")
{
    await RunHost(args[1]);
    return;
}

var published = Path.GetFullPath(args[0]);
var fixture = Path.GetFullPath(args[1]);
var directory = Directory.CreateTempSubdirectory("bsb-host-smoke-").FullName;
try
{
    // Run the test host beside the published BSB runtime. Its application cwd
    // contains only the external service; defaults must come from the host directory.
    foreach (var suffix in new[] { ".dll", ".deps.json", ".runtimeconfig.json" })
        File.Copy(Path.Combine(AppContext.BaseDirectory, "SmokeTests" + suffix), Path.Combine(published, "SmokeTests" + suffix), overwrite: true);
    var pluginDir = Directory.CreateDirectory(Path.Combine(directory, "plugins", "service-smoke")).FullName;
    foreach (var file in Directory.GetFiles(fixture)) File.Copy(file, Path.Combine(pluginDir, Path.GetFileName(file)));
    await File.WriteAllTextAsync(Path.Combine(directory, "bsb-config.json"), """
        {"observable":{"observable-default":{}},"events":{"events-default":{}},
         "services":{"alias":{"plugin":"service-smoke","config":{"value":"loaded"}}}}
        """);
    var start = new System.Diagnostics.ProcessStartInfo("dotnet") { UseShellExecute = false };
    start.ArgumentList.Add(Path.Combine(published, "SmokeTests.dll"));
    start.ArgumentList.Add("--run");
    start.ArgumentList.Add(directory);
    using var child = System.Diagnostics.Process.Start(start)!;
    await child.WaitForExitAsync();
    if (child.ExitCode != 0) throw new Exception($"BSB host exited with {child.ExitCode}");
}
finally { Directory.Delete(directory, recursive: true); }

static async Task RunHost(string directory)
{
    await using var host = ServiceBase.Production(directory);
    await host.Init();
    await host.Run();
    if (await File.ReadAllTextAsync(Path.Combine(directory, "loaded.txt")) != "alias")
        throw new Exception("Host did not discover and run the configured plugin alias");
    var loader = typeof(ServiceBase).GetField("_plugins", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(host)!;
    var metadata = (BSBPluginMetadata?)typeof(SBPlugins).GetMethod("GetMetadata", BindingFlags.Instance | BindingFlags.NonPublic)!
        .Invoke(loader, [new PluginDefinition { Name = "alias", Plugin = "service-smoke" }]);
    if (metadata?.Name != "service-smoke") throw new Exception("Plugin metadata cache lookup failed");
    Console.WriteLine("PASS: published BSB discovers an external plugin, shares BSB types, loads config, wires events and runs lifecycle.");
}
