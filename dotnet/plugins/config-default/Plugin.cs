using BSB.Base;
using BSB.Interfaces;
using System.Text.Json;

/// <summary>
/// Default configuration plugin. Loads plugin configuration from a JSON file.
///
/// Environment variables:
///   BSB_CONFIG_FILE - path to config file (default: ./bsb-config.json)
///   BSB_PROFILE - deployment profile name for config overlay
///
/// Config file format (mirrors Node.js sec-config.yaml but in JSON):
/// {
///   "observable": { "plugin-name": { "plugin": "actual-name", "package": null, "enabled": true, "config": {} } },
///   "events":     { ... },
///   "services":   { "mapped-name": { "plugin": "actual-name", "package": "pkg", "version": "1.0", "config": {} } }
/// }
/// </summary>
public class Plugin : BSBConfig
{
    private JsonDocument? _configDoc;
    private JsonElement _root;
    private string? _activeProfile;

    public Plugin(PluginConstructorArgs args) : base(args) { }

    public override async Task Init(IObservable obs)
    {
        var configFile = Environment.GetEnvironmentVariable("BSB_CONFIG_FILE")
            ?? Path.Combine(Cwd, "bsb-config.json");

        if (File.Exists(configFile))
        {
            obs.Log.Info("Loading config from {file}", new LogMeta { ["file"] = configFile });
            var json = await File.ReadAllTextAsync(configFile);
            _configDoc = JsonDocument.Parse(json, new JsonDocumentOptions
            {
                CommentHandling = JsonCommentHandling.Skip,
                AllowTrailingCommas = true,
            });
            _root = _configDoc.RootElement;

            _activeProfile = Environment.GetEnvironmentVariable("BSB_PROFILE");
            if (_activeProfile is not null)
            {
                if (_root.TryGetProperty("profiles", out var profiles)
                    && profiles.TryGetProperty(_activeProfile, out _))
                {
                    obs.Log.Info("Active profile: {profile}", new LogMeta { ["profile"] = _activeProfile });
                }
                else
                {
                    obs.Log.Warn("Profile '{profile}' not found in config file",
                        new LogMeta { ["profile"] = _activeProfile });
                }
            }
        }
        else
        {
            obs.Log.Warn("No config file found at {file}, using defaults",
                new LogMeta { ["file"] = configFile });
            var emptyDoc = JsonDocument.Parse("{}");
            _configDoc = emptyDoc;
            _root = emptyDoc.RootElement;
        }
    }

    public override Task<Dictionary<string, PluginDefinition>> GetObservablePlugins(IObservable obs)
        => Task.FromResult(GetPluginSection("observable"));

    public override Task<Dictionary<string, PluginDefinition>> GetEventsPlugins(IObservable obs)
        => Task.FromResult(GetPluginSection("events"));

    public override Task<Dictionary<string, PluginDefinition>> GetServicePlugins(IObservable obs)
        => Task.FromResult(GetPluginSection("services"));

    public override Task<object?> GetPluginConfig(IObservable obs, PluginType pluginType, string pluginName)
    {
        var sectionName = pluginType switch
        {
            PluginType.Observable => "observable",
            PluginType.Events => "events",
            PluginType.Service => "services",
            _ => pluginType.ToString().ToLowerInvariant(),
        };

        if (_activeProfile is not null
            && _root.TryGetProperty("profiles", out var profiles)
            && profiles.TryGetProperty(_activeProfile, out var profileRoot)
            && TryGetPluginConfigFromElement(profileRoot, sectionName, pluginName, out var profileConfig))
        {
            return Task.FromResult<object?>(profileConfig);
        }

        if (TryGetPluginConfigFromElement(_root, sectionName, pluginName, out var config))
        {
            return Task.FromResult<object?>(config);
        }

        return Task.FromResult<object?>(null);
    }

    public override ValueTask DisposeAsync()
    {
        GC.SuppressFinalize(this);
        _configDoc?.Dispose();
        return ValueTask.CompletedTask;
    }

    private Dictionary<string, PluginDefinition> GetPluginSection(string sectionName)
    {
        var result = new Dictionary<string, PluginDefinition>();

        JsonElement? profileSection = null;
        if (_activeProfile is not null
            && _root.TryGetProperty("profiles", out var profiles)
            && profiles.TryGetProperty(_activeProfile, out var profileRoot)
            && profileRoot.TryGetProperty(sectionName, out var ps))
        {
            profileSection = ps;
        }

        if (_root.ValueKind == JsonValueKind.Object && _root.TryGetProperty(sectionName, out var section))
        {
            foreach (var prop in section.EnumerateObject())
                result[prop.Name] = ParsePluginDefinition(prop.Name, prop.Value, profileSection);
        }

        if (profileSection.HasValue)
        {
            foreach (var prop in profileSection.Value.EnumerateObject())
            {
                if (!result.ContainsKey(prop.Name))
                    result[prop.Name] = ParsePluginDefinition(prop.Name, prop.Value, null);
            }
        }

        return result;
    }

    private static PluginDefinition ParsePluginDefinition(
        string mappedName, JsonElement value, JsonElement? profileSection)
    {
        var enabled = true;
        string? plugin = null;
        string? package_ = null;
        string? version = null;

        if (value.ValueKind == JsonValueKind.Object)
        {
            if (value.TryGetProperty("plugin", out var pluginProp))
                plugin = pluginProp.GetString();
            if (value.TryGetProperty("package", out var pkgProp) && pkgProp.ValueKind != JsonValueKind.Null)
                package_ = pkgProp.GetString();
            if (value.TryGetProperty("version", out var verProp) && verProp.ValueKind != JsonValueKind.Null)
                version = verProp.GetString();
            if (value.TryGetProperty("enabled", out var enabledProp))
                enabled = enabledProp.GetBoolean();
        }

        if (profileSection.HasValue
            && profileSection.Value.TryGetProperty(mappedName, out var profilePlugin)
            && profilePlugin.TryGetProperty("enabled", out var profileEnabled))
        {
            enabled = profileEnabled.GetBoolean();
        }

        return new PluginDefinition
        {
            Name = mappedName,
            Plugin = plugin,
            Package = package_,
            Version = version,
            Enabled = enabled,
        };
    }

    private static bool TryGetPluginConfigFromElement(
        JsonElement root, string sectionName, string pluginName, out JsonElement config)
    {
        config = default;
        return root.TryGetProperty(sectionName, out var section)
            && section.TryGetProperty(pluginName, out var pluginSection)
            && pluginSection.TryGetProperty("config", out config);
    }
}
