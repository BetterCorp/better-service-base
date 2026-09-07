using BSB.Base;
using BSB.Interfaces;
using System.Text.Json;
using System.Text.Json.Nodes;
using AnyVali;
using YamlDotNet.Serialization;

namespace BSB.Plugins.ConfigDefault;

public class Plugin(PluginConstructorArgs args) : JsonConfigProvider(args)
{
    public static Schema ConfigSchema => V.Object(new() {
        ["BSB_CONFIG_FILE"] = V.Optional(V.String().MinLength(1)),
        ["BSB_PROFILE"] = V.String().Default("default"),
    });
    public override async Task Init(IObservable obs)
    {
        var settings = JsonSerializer.SerializeToNode(RawConfig) as JsonObject;
        var file = settings?["BSB_CONFIG_FILE"]?.GetValue<string>() ?? Environment.GetEnvironmentVariable("BSB_CONFIG_FILE")
            ?? (File.Exists(Path.Combine(Cwd, "bsb-config.json")) ? Path.Combine(Cwd, "bsb-config.json") : Path.Combine(Cwd, "sec-config.yaml"));
        file = Path.GetFullPath(file, Cwd);
        obs.Log.Info("Loading config from {file}", new LogMeta { ["file"] = file });
        var text = await File.ReadAllTextAsync(file);
        if (Path.GetExtension(file).ToLowerInvariant() is ".yaml" or ".yml")
        {
            var value = new DeserializerBuilder().WithDuplicateKeyChecking().WithAttemptingUnquotedStringTypeDeserialization().Build().Deserialize<object>(text);
            text = new SerializerBuilder().JsonCompatible().Build().Serialize(value);
        }
        var document = JsonNode.Parse(text, documentOptions: new JsonDocumentOptions {
            CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true }) as JsonObject
            ?? throw new JsonException("Configuration must be an object");
        LoadConfig(document, settings?["BSB_PROFILE"]?.GetValue<string>() ?? Environment.GetEnvironmentVariable("BSB_PROFILE") ?? "default");
    }
}
