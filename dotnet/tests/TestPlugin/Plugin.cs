using BSB.Base;
using BSB.Interfaces;

public class Settings { public string Value { get; set; } = "default"; }

public class Plugin(ServiceConstructorArgs<Settings> args) : BSBService<Settings>(args)
{
    public new static BSBPluginMetadata Metadata => new() { Name = "service-smoke", Description = "Host loading smoke test" };

    public override Task Init(IObservable obs) => Events.OnReturnableEvent("echo", obs, (_, data) => Task.FromResult(data));

    public override async Task Run(IObservable obs)
    {
        var trace = CreateTrace("smoke");
        var reply = await Events.EmitEventAndReturn("echo", trace, Config.Value);
        if (!Equals(reply, "loaded")) throw new Exception("Plugin config or event wiring failed");
        await File.WriteAllTextAsync(Path.Combine(Cwd, "loaded.txt"), PluginName);
        trace.End();
    }
}
