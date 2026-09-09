using BSB.Base;
using BSB.Interfaces;

public class Settings { public string Value { get; set; } = "default"; }

public class Plugin : BSBService<Settings>
{
    private readonly PluginEvents _client;
    public Plugin(ServiceConstructorArgs<Settings> args) : base(args)
    {
        _client = Events.CreateClient("service-smoke", EventSchemas.Export("service-smoke", "1.0.0"));
    }
    public static AnyVali.Schema ConfigSchema => AnyVali.V.Object(new() { ["value"] = AnyVali.V.String() });
    public new static BSBEventSchemas EventSchemas => new() {
        OnReturnableEvents = new() { ["echo"] = new(AnyVali.V.String(), AnyVali.V.String(), 5) } };
    public new static BSBPluginMetadata Metadata => new() { Name = "service-smoke", Description = "Host loading smoke test" };

    public override Task Init(IObservable obs) => Events.OnReturnableEvent("echo", obs, (_, data) => Task.FromResult(data));

    public override async Task Run(IObservable obs)
    {
        var trace = CreateTrace("smoke");
        var reply = await _client.EmitEventAndReturn("echo", trace, Config.Value);
        if (!Equals(reply, "loaded")) throw new Exception("Plugin config or event wiring failed");
        await File.WriteAllTextAsync(Path.Combine(Cwd, "loaded.txt"), PluginName);
        trace.End();
    }
}
