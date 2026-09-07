using System.Diagnostics;
using System.Text.Json.Nodes;
using BSB.Runtime;

namespace BSB.Tooling;

public static class BsbCli
{
    public static async Task Run(string[] args, string cwd)
    {
        if (args.Length < 2) throw new ArgumentException("Usage: bsb client install|generate|publish, or bsb plugin build|export|pack|install");
        var positional = new List<string>(); var options = new Dictionary<string, string>();
        for (var i = 2; i < args.Length; i++)
        {
            if (!args[i].StartsWith("--")) { positional.Add(args[i]); continue; }
            var key = args[i];
            if (key == "--allow-insecure") { options.Add(key, "true"); continue; }
            if (key is not ("--source-language" or "--version" or "--target" or "--token" or "--plugin" or "--org" or "--package" or "--source"))
                throw new ArgumentException($"Unknown option: {key}");
            if (++i >= args.Length || args[i].StartsWith("--")) throw new ArgumentException($"Missing value for {key}");
            options.Add(key, args[i]);
        }
        if (positional.Count > 1) throw new ArgumentException("Only one project, assembly or plugin ID is accepted");
        switch ((args[0], args[1]))
        {
            case ("plugin", "pack"):
                await NativePackages.Pack(cwd, positional.SingleOrDefault() ?? Directory.GetFiles(cwd, "*.csproj").Single()); return;
            case ("plugin", "install"):
                Console.WriteLine(await NativePackages.Install(cwd, positional.Single(), options.GetValueOrDefault("--version") ?? throw new ArgumentException("--version is required"), options.GetValueOrDefault("--source"))); return;
            case ("client", "generate"):
                await RegistryClient.Regenerate(cwd); return;
            case ("client", "install"):
                var source = positional.Single();
                if (Uri.TryCreate(source, UriKind.Absolute, out var hosted) && hosted.Scheme is "http" or "https")
                    Console.WriteLine(await HostedClient.Install(cwd, source, options.GetValueOrDefault("--plugin"), options.GetValueOrDefault("--source-language"), options.GetValueOrDefault("--version"), options.ContainsKey("--allow-insecure")));
                else using (var client = new RegistryClient(options.GetValueOrDefault("--target"), options.GetValueOrDefault("--token"), options.ContainsKey("--allow-insecure")))
                    Console.WriteLine(await client.Install(cwd, source, options.GetValueOrDefault("--source-language"), options.GetValueOrDefault("--version")));
                return;
            case ("plugin", "export"):
                await SaveExports(cwd, SBPlugins.ExportAssembly(Path.GetFullPath(positional.Single(), cwd), options.GetValueOrDefault("--package"), options.GetValueOrDefault("--version")));
                return;
            case ("plugin", "build"):
                var project = Path.GetFullPath(positional.SingleOrDefault() ?? Directory.GetFiles(cwd, "*.csproj").Single(), cwd);
                var properties = JsonNode.Parse(await Process("dotnet", ["msbuild", project, "-getProperty:AssemblyName,PackageId,Version"], cwd))!["Properties"]!;
                await RegistryClient.Regenerate(cwd);
                var output = Path.Combine(cwd, "lib");
                Console.WriteLine(await Process("dotnet", ["publish", project, "-c", "Release", "-o", output], cwd));
                await SaveExports(cwd, SBPlugins.ExportAssembly(Path.Combine(output, properties["AssemblyName"]!.GetValue<string>() + ".dll"),
                    properties["PackageId"]!.GetValue<string>(), properties["Version"]!.GetValue<string>()));
                return;
            case ("client", "publish"):
                var manifest = JsonNode.Parse(await File.ReadAllTextAsync(Path.Combine(cwd, "bsb-plugin.json")))!["csharp"]!.AsArray();
                var selected = options.GetValueOrDefault("--plugin");
                var entries = manifest.Where(x => selected is null || x!["id"]!.GetValue<string>() == selected).ToArray();
                if (entries.Length == 0) throw new ArgumentException("No matching plugin in manifest; run plugin build first");
                var token = options.GetValueOrDefault("--token") ?? Environment.GetEnvironmentVariable("BSB_REGISTRY_TOKEN");
                if (string.IsNullOrEmpty(token)) throw new ArgumentException("Publishing requires --token or BSB_REGISTRY_TOKEN");
                using (var registry = new RegistryClient(options.GetValueOrDefault("--target"), token, options.ContainsKey("--allow-insecure")))
                {
                    foreach (var entry in entries)
                    {
                        var schema = JsonNode.Parse(await File.ReadAllTextAsync(Path.Combine(cwd, "lib", "schemas", entry!["id"]!.GetValue<string>() + ".json")))!;
                        var body = new JsonObject {
                            ["org"] = options.GetValueOrDefault("--org") ?? "_", ["name"] = entry["id"]!.DeepClone(),
                            ["version"] = entry["version"]!.DeepClone(), ["language"] = "csharp",
                            ["metadata"] = new JsonObject { ["displayName"] = entry["id"]!.DeepClone(), ["description"] = entry["description"]!.DeepClone(), ["category"] = entry["category"]!.DeepClone(), ["tags"] = new JsonArray() },
                            ["eventSchema"] = schema.DeepClone(), ["configSchema"] = schema["configSchema"]?.DeepClone(),
                            ["package"] = new JsonObject { ["csharp"] = entry["package"]!.DeepClone() },
                        };
                        var vault = options.ContainsKey("--target");
                        body["eventSchema"]!.AsObject().Remove("configSchema");
                        if (body["configSchema"] is null) body.Remove("configSchema");
                        if (!vault)
                        {
                            body["documentation"] = await ReadDocumentation(cwd, entry.AsObject());
                            body["eventSchema"]!.AsObject().Remove("pluginId");
                        }
                        Console.WriteLine(await registry.Request(HttpMethod.Post, vault ? "/api/plugins/publish" : "/plugins", body));
                    }
                }
                return;
            default: throw new ArgumentException($"Unknown command: {args[0]} {args[1]}");
        }
    }

    internal static async Task<JsonArray> ReadDocumentation(string cwd, JsonObject entry)
    {
        var paths = entry["documentation"]?.AsArray().Select(value => value!.GetValue<string>()).ToArray() ?? [];
        if (paths.Length == 0) paths = ["README.md"];
        if (paths.Length > 20) throw new ArgumentException("Registry accepts at most 20 documentation files");
        var docs = new JsonArray();
        foreach (var path in paths)
        {
            var fullPath = Path.GetFullPath(path, cwd);
            if (!File.Exists(fullPath)) throw new ArgumentException($"Public Registry publishing requires documentation; missing {path}. Set Metadata.Documentation or add README.md");
            var content = await File.ReadAllTextAsync(fullPath);
            if (string.IsNullOrWhiteSpace(content) || content.Length > 1_000_000) throw new ArgumentException($"Documentation must contain 1 to 1,000,000 characters: {path}");
            docs.Add(content);
        }
        return docs;
    }

    private static async Task SaveExports(string cwd, JsonArray exports)
    {
        var schemas = Path.Combine(cwd, "lib", "schemas"); Directory.CreateDirectory(schemas);
        var names = new HashSet<string>();
        foreach (var entry in exports)
        {
            var id = entry!["id"]!.GetValue<string>(); RegistryClient.ParsePluginId(id);
            if (id.Contains('/') || !names.Add(id)) throw new InvalidOperationException("Plugin IDs must be unique local names");
            await File.WriteAllTextAsync(Path.Combine(schemas, id + ".json"), entry["schema"]!.ToJsonString(Interfaces.EventSchemaExport.JsonOptions));
            entry.AsObject().Remove("schema");
        }
        await File.WriteAllTextAsync(Path.Combine(cwd, "lib", "bsb-plugin.json"), new JsonObject { ["csharp"] = exports.DeepClone() }.ToJsonString(Interfaces.EventSchemaExport.JsonOptions));
        foreach (var entry in exports) entry!["assembly"] = "lib/" + entry["assembly"]!.GetValue<string>();
        await File.WriteAllTextAsync(Path.Combine(cwd, "bsb-plugin.json"), new JsonObject { ["csharp"] = exports }.ToJsonString(Interfaces.EventSchemaExport.JsonOptions));
    }

    internal static async Task<string> Process(string executable, string[] arguments, string cwd)
    {
        var start = new ProcessStartInfo(executable) { WorkingDirectory = cwd, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        using var process = System.Diagnostics.Process.Start(start) ?? throw new InvalidOperationException($"Unable to start {executable}");
        var output = process.StandardOutput.ReadToEndAsync(); var errors = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        var stdout = await output; var stderr = await errors;
        if (process.ExitCode != 0) throw new InvalidOperationException($"{executable} exited {process.ExitCode}: {stdout}\n{stderr}");
        return stdout;
    }
}
