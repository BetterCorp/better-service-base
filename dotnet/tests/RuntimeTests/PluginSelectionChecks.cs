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
