using BSB.Base;
using BSB.Interfaces;
using BSB.Runtime;

static class LifecycleChecks
{
    public static async Task Run()
    {
        PluginSelectionChecks.Run();
        var calls = new List<string>();
        await using var observable = new SBObservable();
        await using var events = new SBEvents(new PluginConstructorArgs { AppId = "test", PluginName = "events", Cwd = ".", Mode = DebugMode.Development });
        await using (var services = new SBServices())
        {
            services.AddService("consumer", new Service("consumer", calls), new() {
                Name = "service-consumer", Description = "", InitAfterPlugins = ["service-provider", "mapped"], RunBeforePlugins = ["service-provider"] });
            services.AddService("mapped", new Service("mapped", calls), new() { Name = "service-provider", Description = "", InitBeforePlugins = ["consumer"] });
            await services.Init(observable, events); await services.Run(observable);
        }
        if (!calls.SequenceEqual(new[] { "init:mapped", "init:consumer", "run:consumer", "run:mapped", "dispose:consumer", "dispose:mapped" }))
            throw new Exception("Lifecycle aliases, duplicate edges or reverse cleanup failed");
        await using var cyclic = new SBServices();
        cyclic.AddService("mapped", new Service("mapped", calls), new() { Name = "service-provider", Description = "", InitAfterPlugins = ["service-provider"] });
        try { await cyclic.Init(observable, events); throw new Exception("Self dependency accepted"); }
        catch (InvalidOperationException error) when (error.Message.Contains("cycle")) { }
        Console.WriteLine("PASS: lifecycle aliases, duplicate ordering hints, self-cycle rejection and reverse cleanup");
    }
    sealed class Service(string name, List<string> calls) : BSBService<object>(new ServiceConstructorArgs<object> {
        AppId = "test", PluginName = name, Cwd = ".", Mode = DebugMode.Development, Config = new() })
    {
        public override Task Init(IObservable obs) {
            var one = CreateTrace("request1"); var two = CreateTrace("request2");
            if (one.TraceId == two.TraceId || one.TraceId == obs.TraceId) throw new Exception("Independent work shared a root trace");
            one.End(); two.End(); calls.Add("init:" + PluginName); return Task.CompletedTask;
        }
        public override Task Run(IObservable obs) { calls.Add("run:" + PluginName); return Task.CompletedTask; }
        public override ValueTask DisposeAsync() { calls.Add("dispose:" + PluginName); return ValueTask.CompletedTask; }
    }
}
