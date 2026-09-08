using AnyVali;
using BSB.Base;
using BSB.Interfaces;
using BSB.Plugins.EventsDefault;
using BSB.Tooling;
using System.Diagnostics;
using System.Globalization;

static class FractionalTimeoutChecks
{
    public static async Task Run()
    {
        var schema = new BSBEventSchemas { OnReturnableEvents = new() {
            ["half"] = new(V.String(), V.String(), .5) } };
        var exported = EventSchemaExport.FromJson(schema.Export("service-half", "1.0.0").ToJson());
        if (exported.Events["half"].DefaultTimeoutSeconds != .5 ||
            BSBEventSchemas.Import(exported).OnReturnableEvents["half"].DefaultTimeoutSeconds != .5)
            throw new Exception("Fractional schema timeout was lost");
        var culture = CultureInfo.CurrentCulture;
        string code;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("fr-FR");
            code = ClientGenerator.Generate(exported, "service-half");
        }
        finally { CultureInfo.CurrentCulture = culture; }
        if (!code.Contains("double timeoutSeconds = 0.5", StringComparison.Ordinal))
            throw new Exception("Generated fractional timeout was lost");

        var obs = new ObservableBackend("test", "timeout", new(), new());
        await using var events = new Plugin(new PluginConstructorArgs { AppId = "test", Cwd = ".", Mode = DebugMode.Development, PluginName = "events" });
        await events.OnReturnableEvent("worker", "slow", obs, async (_, _) => { await Task.Delay(1000); return null; });
        var elapsed = Stopwatch.StartNew();
        try { await events.EmitEventAndReturn("worker", "slow", obs, null, .05); throw new Exception("Fractional runtime timeout was ignored"); }
        catch (TimeoutException) { }
        if (elapsed.Elapsed > TimeSpan.FromSeconds(.5)) throw new Exception("Fractional timeout was rounded up");

        foreach (var invalid in new[] { 0d, -1d, double.NaN, double.PositiveInfinity, 86400.1 })
            try { BSBEvents.TimeoutDuration(invalid); throw new Exception("Invalid timeout accepted"); }
            catch (ArgumentOutOfRangeException) { }
        Console.WriteLine("PASS: fractional RPC timeout JSON, generated defaults and runtime deadline");
    }

}
