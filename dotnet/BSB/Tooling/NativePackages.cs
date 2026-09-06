using System.Security;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace BSB.Tooling;

/// <summary>Uses NuGet restore/publish for dependency resolution; BSB only supplies its plugin manifest.</summary>
public static class NativePackages
{
    private static string Xml(string value) => SecurityElement.Escape(value)!;
    public static async Task Pack(string cwd, string project)
    {
        await BsbCli.Run(["plugin", "build", project], cwd);
        var metadata = Path.Combine(cwd, "lib");
        var targets = Path.Combine(cwd, ".bsb", "native-pack.targets");
        Directory.CreateDirectory(Path.GetDirectoryName(targets)!);
        await File.WriteAllTextAsync(targets, $"""
        <Project><ItemGroup>
          <None Include="{Xml(Path.Combine(metadata, "bsb-plugin.json"))}" Pack="true" PackagePath="bsb/" />
          <None Include="{Xml(Path.Combine(metadata, "schemas", "*.json"))}" Pack="true" PackagePath="bsb/schemas/" />
          <None Include="{Xml(Path.Combine(metadata, "*.deps.json"))}" Pack="true" PackagePath="bsb/" />
        </ItemGroup></Project>
        """);
        Console.WriteLine(await BsbCli.Process("dotnet", ["pack", Path.GetFullPath(project, cwd), "-c", "Release", "--no-build", "-o", Path.Combine(cwd, "packages"),
            "-p:CustomAfterMicrosoftCommonTargets=" + targets], cwd));
    }

    public static async Task<string> Install(string cwd, string package, string version, string? source = null)
    {
        if (!Regex.IsMatch(package, "^[A-Za-z0-9][A-Za-z0-9_.-]*$") || !Regex.IsMatch(version, "^[0-9]+\\.[0-9]+\\.[0-9]+$"))
            throw new ArgumentException("A NuGet package ID and exact major.minor.patch version are required");
        var root = Path.GetFullPath(Environment.GetEnvironmentVariable("BSB_PLUGIN_DIR") ?? Environment.GetEnvironmentVariable("BSB_PLUGINS_DIR") ?? Path.Combine(cwd, ".bsb", "plugins"), cwd);
        var packageRoot = Path.Combine(root, package);
        var destination = Path.Combine(packageRoot, version);
        if (Directory.Exists(destination))
        {
            if (!File.Exists(Path.Combine(destination, "bsb-plugin.json"))) throw new IOException("Existing plugin installation is incomplete");
            return destination;
        }
        Directory.CreateDirectory(packageRoot);
        var staging = Path.Combine(packageRoot, ".install-" + Guid.NewGuid().ToString("N"));
        var build = Path.Combine(staging, "build"); var output = Path.Combine(staging, "output");
        Directory.CreateDirectory(build);
        try
        {
            var project = Path.Combine(build, "Install.csproj");
            await File.WriteAllTextAsync(project, $"""
            <Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework>
            <EnableDynamicLoading>true</EnableDynamicLoading><AssemblyName>BsbPluginInstall</AssemblyName></PropertyGroup>
            <ItemGroup><PackageReference Include="{Xml(package)}" Version="[{Xml(version)}]" /></ItemGroup></Project>
            """);
            var restore = new List<string> { "restore", project };
            if (source is not null) { restore.Add("--source"); restore.Add(source); }
            await BsbCli.Process("dotnet", restore.ToArray(), build);
            var assets = JsonNode.Parse(await File.ReadAllTextAsync(Path.Combine(build, "obj", "project.assets.json")))!;
            var library = assets["libraries"]!.AsObject().Single(x => x.Key.Equals(package + "/" + version, StringComparison.OrdinalIgnoreCase)).Value!;
            var relative = library["path"]!.GetValue<string>().Replace('/', Path.DirectorySeparatorChar);
            var packageDirectory = assets["packageFolders"]!.AsObject().Select(x => Path.Combine(x.Key, relative)).Single(Directory.Exists);
            var manifestPath = Path.Combine(packageDirectory, "bsb", "bsb-plugin.json");
            if (!File.Exists(manifestPath)) throw new InvalidDataException("NuGet package has no BSB manifest; its author must use bsb plugin pack");
            var manifest = JsonNode.Parse(await File.ReadAllTextAsync(manifestPath))!.AsObject();
            var entries = manifest["csharp"]?.AsArray() ?? throw new InvalidDataException("NuGet package has no csharp plugins");
            if (entries.Count == 0) throw new InvalidDataException("Plugin manifest is empty");
            foreach (var entry in entries)
            {
                var id = entry!["id"]!.GetValue<string>(); var (_, localName) = RegistryClient.ParsePluginId(id);
                if (localName != id || entry["version"]!.GetValue<string>() != version ||
                    !string.Equals(entry["package"]!.GetValue<string>(), package, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("NuGet plugin manifest identity/version does not match the requested package");
                var assembly = entry["assembly"]!.GetValue<string>();
                if (Path.GetFileName(assembly) != assembly || !assembly.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("Plugin manifest assembly must be a local DLL filename");
            }
            await BsbCli.Process("dotnet", ["publish", project, "-c", "Release", "--no-restore", "-o", output], build);
            foreach (var entry in entries)
            {
                var assembly = entry!["assembly"]!.GetValue<string>();
                if (!File.Exists(Path.Combine(output, assembly))) throw new InvalidDataException("Published NuGet package is missing its plugin assembly");
                var deps = Path.ChangeExtension(assembly, ".deps.json");
                if (File.Exists(Path.Combine(packageDirectory, "bsb", deps))) File.Copy(Path.Combine(packageDirectory, "bsb", deps), Path.Combine(output, deps), true);
            }
            File.Copy(manifestPath, Path.Combine(output, "bsb-plugin.json"));
            // Atomic, immutable version directory: an interrupted installation cannot appear complete.
            Directory.Move(output, destination);
            return destination;
        }
        finally
        {
            var resolved = Path.GetFullPath(staging);
            if (!resolved.StartsWith(Path.GetFullPath(packageRoot) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Installer staging directory escaped its package root");
            if (Directory.Exists(resolved)) Directory.Delete(resolved, true);
        }
    }
}
