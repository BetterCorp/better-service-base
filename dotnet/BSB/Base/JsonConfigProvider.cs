using BSB.Interfaces;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace BSB.Base;

/// <summary>Common profile and plugin resolution for JSON, environment and Vault providers.</summary>
public abstract class JsonConfigProvider(PluginConstructorArgs args) : BSBConfig(args)
{
    private JsonObject? _profile;
    protected void LoadConfig(JsonObject document, string profileName)
    {
        // Accept the original .NET root-sections format as well as Node profile documents.
        var legacy = document.ContainsKey("services") || document.ContainsKey("events") || document.ContainsKey("observable");
        var defaults = legacy ? document : document["default"] as JsonObject ?? new();
        var selected = legacy ? document["profiles"]?[profileName] as JsonObject : document[profileName] as JsonObject;
        if (!legacy && selected is null && profileName != "default") throw new JsonException($"Missing configuration profile: {profileName}");
        _profile = Merge(defaults, selected);
        if (_profile["language"]?.GetValue<string>() is string hostLanguage && hostLanguage is not ("csharp" or "dotnet"))
            throw new JsonException($"Profile requires {hostLanguage}; this host is csharp");
        foreach (var section in new[] { "observable", "events", "services" })
        {
            if (_profile[section] is null) _profile[section] = new JsonObject();
            if (_profile[section] is not JsonObject entries) throw new JsonException($"Invalid {section} configuration");
            foreach (var (name, node) in entries)
            {
                if (node is not JsonObject entry) throw new JsonException($"Invalid plugin definition: {name}");
                var language = entry["language"]?.GetValue<string>();
                if (entry["enabled"]?.GetValue<bool>() != false && language is not null && language is not ("csharp" or "dotnet"))
                    throw new JsonException($"Enabled plugin {name} requires {language}; this host is csharp");
            }
        }
    }

    protected static JsonObject Merge(JsonObject defaults, JsonObject? selected)
    {
        var merged = defaults.DeepClone().AsObject();
        if (selected is not null) foreach (var (key, value) in selected)
            merged[key] = value is JsonObject source && merged[key] is JsonObject target ? Merge(target, source) : value?.DeepClone();
        return merged;
    }

    protected static void ApplyOverrides(JsonObject config, string profile, string? json)
    {
        if (string.IsNullOrEmpty(json)) return;
        if (json.Length > 128 * 1024) throw new JsonException("BSB_CONFIG_OVERRIDES is too large");
        var overrides = JsonNode.Parse(json) as JsonObject ?? throw new JsonException("BSB_CONFIG_OVERRIDES must be an object");
        var nodes = 0;
        void Safe(JsonNode? node, int depth)
        {
            if (++nodes > 10000 || depth > 64) throw new JsonException("Override payload is too complex");
            if (node is JsonArray array) foreach (var child in array) Safe(child, depth + 1);
            if (node is JsonObject obj) foreach (var (key, child) in obj)
            {
                if (key is "__proto__" or "prototype" or "constructor") throw new JsonException("Forbidden override key");
                Safe(child, depth + 1);
            }
        }
        Safe(overrides, 0);
        foreach (var (section, values) in overrides)
        {
            if (section is not ("services" or "events" or "observable") || values is not JsonObject plugins)
                throw new JsonException("Invalid override section");
            foreach (var (name, patch) in plugins)
            {
                var plugin = config[profile]?[section]?[name] as JsonObject ?? throw new JsonException($"Unknown override plugin: {name}");
                if (patch is not JsonObject source || plugin["envOverridePaths"] is not JsonArray allowed)
                    throw new JsonException($"Environment overrides are not permitted: {name}");
                var paths = allowed.Select(x => x?.GetValue<string>() ?? throw new JsonException("Invalid override path")).ToHashSet();
                void ValidatePaths(JsonObject value, string prefix)
                {
                    foreach (var (key, child) in value)
                    {
                        var path = prefix.Length == 0 ? key : $"{prefix}.{key}";
                        if (paths.Contains(path)) continue;
                        if (child is JsonObject { Count: > 0 } nested) ValidatePaths(nested, path);
                        else throw new JsonException($"Override path is not permitted: {name}.{path}");
                    }
                }
                ValidatePaths(source, "");
                plugin["config"] = Merge(plugin["config"] as JsonObject ?? new(), source);
            }
        }
    }

    private JsonObject Section(string name) => (_profile ?? throw new InvalidOperationException("Configuration is not initialized"))[name]!.AsObject();
    private Dictionary<string, PluginDefinition> Plugins(string section) => Section(section).ToDictionary(p => p.Key, p => {
        var entry = p.Value!.AsObject();
        return new PluginDefinition {
            Name = p.Key, Plugin = entry["plugin"]?.GetValue<string>(), Package = entry["package"]?.GetValue<string>(),
            Version = entry["version"]?.GetValue<string>(), Enabled = entry["enabled"]?.GetValue<bool>() ?? true,
            Language = entry["language"]?.GetValue<string>(),
            Filter = entry["filter"] is null ? null : JsonSerializer.SerializeToElement(entry["filter"]),
        };
    });
    public override Task<Dictionary<string, PluginDefinition>> GetObservablePlugins(IObservable obs) => Task.FromResult(Plugins("observable"));
    public override Task<Dictionary<string, PluginDefinition>> GetEventsPlugins(IObservable obs) => Task.FromResult(Plugins("events"));
    public override Task<Dictionary<string, PluginDefinition>> GetServicePlugins(IObservable obs)
    {
        var plugins = Plugins("services");
        if (!plugins.Values.Any(p => p.Enabled)) throw new InvalidOperationException("At least one enabled service is required");
        return Task.FromResult(plugins);
    }
    public override Task<object?> GetPluginConfig(IObservable obs, PluginType type, string name)
    {
        var section = type switch { PluginType.Service => "services", PluginType.Observable => "observable", PluginType.Events => "events", _ => throw new ArgumentOutOfRangeException(nameof(type)) };
        return Task.FromResult<object?>(JsonSerializer.SerializeToElement(Section(section)[name]?["config"] ?? new JsonObject()));
    }
}
