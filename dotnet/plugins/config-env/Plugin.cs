using BSB.Base;
using BSB.Interfaces;
using System.Text.Json;
using System.Text.Json.Nodes;
using AnyVali;

public class Plugin(PluginConstructorArgs args) : JsonConfigProvider(args)
{
    public static Schema ConfigSchema => V.Object(new() {
        ["BSB_CONFIG_JSON"] = V.String().MinLength(1), ["BSB_PROFILE"] = V.String().Default("default"),
    });
    public override Task Init(IObservable obs)
    {
        var settings = JsonSerializer.SerializeToNode(RawConfig) as JsonObject;
        var json = settings?["BSB_CONFIG_JSON"]?.GetValue<string>() ?? Environment.GetEnvironmentVariable("BSB_CONFIG_JSON")
            ?? throw new InvalidOperationException("BSB_CONFIG_JSON is required");
        var profile = settings?["BSB_PROFILE"]?.GetValue<string>() ?? Environment.GetEnvironmentVariable("BSB_PROFILE") ?? "default";
        LoadConfig(JsonNode.Parse(json) as JsonObject ?? throw new JsonException("BSB_CONFIG_JSON must be an object"), profile);
        return Task.CompletedTask;
    }
}
