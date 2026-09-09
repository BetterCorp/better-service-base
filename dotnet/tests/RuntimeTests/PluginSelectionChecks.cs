using BSB.Interfaces;
using BSB.Runtime;
using System.Reflection;

static class PluginSelectionChecks
{
    public static void Run()
    {
        var find = typeof(SBPlugins).GetMethod("FindPluginType", BindingFlags.Static | BindingFlags.NonPublic)!;
        var assembly = typeof(PluginSelectionChecks).Assembly;
        if (find.Invoke(null, [assembly, typeof(NamedSelectionBase), "requested"]) as Type != typeof(NamedSelectionCandidate))
            throw new Exception("Matching plugin metadata was not selected");
        try
        {
            find.Invoke(null, [assembly, typeof(NamedSelectionBase), "different"]);
            throw new Exception("Mismatched plugin metadata was accepted");
        }
        catch (TargetInvocationException error) when (error.InnerException is InvalidOperationException mismatch && mismatch.Message.Contains("Metadata.Name")) { }
        if (find.Invoke(null, [assembly, typeof(LegacySelectionBase), "legacy"]) as Type != typeof(LegacySelectionCandidate))
            throw new Exception("Legacy plugin without metadata lost its sole-candidate fallback");

        var directory = Directory.CreateTempSubdirectory("bsb-pinned-plugin-").FullName;
        var pluginDirectory = Path.Combine(directory, ".bsb", "plugins");
        var localDirectory = Path.Combine(directory, "plugins");
        Directory.CreateDirectory(Path.Combine(pluginDirectory, "local"));
        Directory.CreateDirectory(localDirectory);
        File.Copy(assembly.Location, Path.Combine(pluginDirectory, "local", "local.dll"));
        File.Copy(assembly.Location, Path.Combine(localDirectory, "local.dll"));
        var previous = Environment.GetEnvironmentVariable("BSB_PLUGIN_DIR");
        try
        {
            Environment.SetEnvironmentVariable("BSB_PLUGIN_DIR", pluginDirectory);
            var loader = new SBPlugins(directory);
            var resolve = typeof(SBPlugins).GetMethod("ResolveAssemblyPath", BindingFlags.Instance | BindingFlags.NonPublic)!;
            var unpinned = new PluginDefinition { Name = "local" };
            if (resolve.Invoke(loader, [unpinned]) is not string)
                throw new Exception("Unpinned local plugin no longer resolves");
            foreach (var selector in new[] { "1.2.3", "1.2" })
                if (resolve.Invoke(loader, [new PluginDefinition { Name = "local", Version = selector }]) is not null)
                    throw new Exception($"Pinned plugin {selector} resolved from an unverifiable flat assembly");
            var pinned = new PluginDefinition { Name = "local", Version = "1.2.3" };
            var exact = Path.Combine(pluginDirectory, "local", "1.2.3");
            Directory.CreateDirectory(exact);
            File.Copy(assembly.Location, Path.Combine(exact, "local.dll"));
            if (resolve.Invoke(loader, [pinned]) is not string resolved || Path.GetDirectoryName(resolved) != exact)
                throw new Exception("Pinned plugin did not resolve from its exact version directory");
        }
        finally
        {
            Environment.SetEnvironmentVariable("BSB_PLUGIN_DIR", previous);
            Directory.Delete(directory, recursive: true);
        }
        Console.WriteLine("PASS: plugin selection requires matching metadata and retains legacy fallback");
    }
}

public abstract class NamedSelectionBase { }
public sealed class NamedSelectionCandidate : NamedSelectionBase
{
    public static BSBPluginMetadata Metadata { get; } = new() { Name = "requested", Description = "test" };
}
public abstract class LegacySelectionBase { }
public sealed class LegacySelectionCandidate : LegacySelectionBase { }
