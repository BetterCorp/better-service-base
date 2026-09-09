using AnyVali;
using BSB.Base;
using BSB.Interfaces;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace BSB.Examples;

internal static class Contracts
{
    public static JsonObject Read(string name) {
        using var stream = typeof(Contracts).Assembly.GetManifestResourceStream("Contracts." + name + ".json")!;
        return JsonNode.Parse(stream)!.AsObject();
    }
    public static BSBEventSchemas Events(string name) => BSBEventSchemas.Import(EventSchemaExport.FromJson(Read(name).ToJsonString()));
    public static JsonObject Input(object? value) => JsonSerializer.SerializeToNode(value)!.AsObject();
    public static BSBPluginMetadata Metadata(string name) => new() { Name = name, Description = "Native BSB example " + name, Tags = ["example"] };
}

public sealed class Default0Config { public double Testa { get; init; } public double Testb { get; init; } }
public sealed class Default0(ServiceConstructorArgs<Default0Config> args) : BSBService<Default0Config>(args)
{
    public new static BSBPluginMetadata Metadata => Contracts.Metadata("service-default0");
    public static Schema ConfigSchema => V.Object(new() { ["testa"] = V.Number().Min(0).Default(0d), ["testb"] = V.Number().Min(0).Default(0d) });
    public new static BSBEventSchemas EventSchemas => Contracts.Events("service-default0");
    public override async Task Run(IObservable obs) {
        await Events.EmitEvent("test", obs, new { a = "test", b = "test" });
        var result = await Events.EmitEventAndReturn("calculate", obs, new { a = Config.Testa, b = Config.Testb });
        obs.Log.Info("Calculation result: {result}", new() { ["result"] = result });
    }
}

public sealed class Default1 : BSBService<object>
{
    public new static BSBPluginMetadata Metadata => Contracts.Metadata("service-default1");
    public static Schema ConfigSchema => V.Object(new()).Default(new Dictionary<string, object?>());
    public new static BSBEventSchemas EventSchemas => Contracts.Events("service-default1");
    private readonly ServiceDefault0Client _zero;
    public Default1(ServiceConstructorArgs<object> args) : base(args) => _zero = new(Events);
    public override async Task Init(IObservable obs) {
        await _zero.OnCalculate(obs, (_, input) => Task.FromResult(input.A * input.B));
        await _zero.OnTest(obs, (span, input) => { span.Log.Info(input.A + input.B); return Task.CompletedTask; });
        await Events.OnReturnableEvent("calculate", obs, (_, value) => {
            var input = Contracts.Input(value); return Task.FromResult<object?>(input["a"]!.GetValue<double>() * input["b"]!.GetValue<double>());
        });
        await Events.OnReturnableEvent("text.transform", obs, (_, value) => {
            var input = Contracts.Input(value); var text = input["text"]!.GetValue<string>();
            return Task.FromResult<object?>(input["transformation"]!.GetValue<string>() switch {
                "uppercase" => text.ToUpperInvariant(), "lowercase" => text.ToLowerInvariant(),
                "reverse" => string.Concat(text.EnumerateRunes().Reverse()),
                "capitalize" => text.Length == 0 ? "" : char.ToUpperInvariant(text[0]) + text[1..].ToLowerInvariant(), _ => text });
        });
        await Events.OnEvent("data.received", obs, async (span, value) => {
            var input = Contracts.Input(value);
            await Events.EmitEvent("data.processed", span, new { itemId = input["itemId"]!.GetValue<string>(), result = new { processed = true, timestamp = DateTimeOffset.UtcNow.ToString("O") }, processingTime = 0 });
        });
        await Events.OnBroadcast("config.updated", obs, (span, _) => { span.Log.Info("Configuration updated"); return Task.CompletedTask; });
    }
}

public sealed class Default2 : BSBService<object>
{
    public new static BSBPluginMetadata Metadata => Contracts.Metadata("service-default2");
    public static Schema ConfigSchema => V.Object(new()).Default(new Dictionary<string, object?>());
    public new static BSBEventSchemas EventSchemas => Contracts.Events("service-default2");
    private readonly ServiceDefault1Client _one;
    private readonly ServiceDefault3Client _three;
    public Default2(ServiceConstructorArgs<object> args) : base(args) { _one = new(Events); _three = new(Events); }
    public override async Task Init(IObservable obs) {
        await Events.OnReturnableEvent("calculate", obs, (_, value) => {
            var input = Contracts.Input(value); return Task.FromResult<object?>(input["a"]!.GetValue<double>() * input["b"]!.GetValue<double>());
        });
        // Register listeners during Init so Run order cannot race the first RPC.
        await _three.OnCalculate(obs, (_, input) => Task.FromResult(input.A * input.B));
    }
    public override async Task Run(IObservable obs) => obs.Log.Info("Calculation result: {result}", new() { ["result"] = await _one.Calculate(obs, new() { A = 5, B = 5 }) });
}

public sealed class Default3(ServiceConstructorArgs<object> args) : BSBService<object>(args)
{
    public new static BSBPluginMetadata Metadata => new() { Name = "service-default3", Description = "Native reverse and RPC example", InitAfterPlugins = ["service-default2"] };
    public static Schema ConfigSchema => V.Object(new()).Default(new Dictionary<string, object?>());
    public new static BSBEventSchemas EventSchemas => Contracts.Events("service-default3");
    public override Task Init(IObservable obs) => Events.OnReturnableEvent("onReverseReturnable", obs, (_, value) =>
        Task.FromResult<object?>(string.Concat(Contracts.Input(value)["text"]!.GetValue<string>().EnumerateRunes().Reverse())));
    public override async Task Run(IObservable obs) => obs.Log.Info("Calculation result: {result}", new() {
        ["result"] = await Events.EmitEventAndReturn("calculate", obs, new { a = 18, b = 19 }) });
}

public sealed class Default4(ServiceConstructorArgs<object> args) : BSBService<object>(args)
{
    public new static BSBPluginMetadata Metadata => Contracts.Metadata("service-default4");
    public static Schema ConfigSchema => V.Object(new()).Default(new Dictionary<string, object?>());
    public new static BSBEventSchemas EventSchemas => Contracts.Events("service-default4");
    public override Task Run(IObservable obs) { obs.Log.Info("Running service-default4"); return Task.CompletedTask; }
}

public sealed class BenchmarkConfig { public int Iterations { get; init; } = 1000; }
public sealed class Benchmark : BSBService<BenchmarkConfig>
{
    public new static BSBPluginMetadata Metadata => Contracts.Metadata("service-benchmarkify");
    public static Schema ConfigSchema => V.Object(new() { ["iterations"] = V.Int32().Min(1).Max(100000).Default(1000) });
    public new static BSBEventSchemas EventSchemas => Contracts.Events("service-benchmarkify");
    private readonly ServiceBenchmarkifyClient _self;
    private readonly SemaphoreSlim _running = new(1);
    public Benchmark(ServiceConstructorArgs<BenchmarkConfig> args) : base(args) => _self = new(Events, PluginName);
    public override async Task Init(IObservable obs) {
        await Events.OnReturnableEvent("add", obs, (_, value) => { var input = Contracts.Input(value); return Task.FromResult<object?>(input["a"]!.GetValue<double>() + input["b"]!.GetValue<double>()); });
        await Events.OnReturnableEvent("void", obs, (_, _) => Task.FromResult<object?>(null));
        await Events.OnEvent("benchmark.trigger", obs, (span, _) => Run(span));
    }
    public override async Task Run(IObservable obs) {
        if (!await _running.WaitAsync(0)) throw new InvalidOperationException("Benchmark already running");
        try {
            var results = new List<object>();
            foreach (var operation in new[] { "add", "void" }) {
                var watch = Stopwatch.StartNew();
                for (var i = 0; i < Config.Iterations; i++) {
                    if (operation == "add") await _self.Add(obs, new() { A = 5, B = 3 });
                    else await _self.Void(obs, new());
                }
                var duration = watch.Elapsed.TotalMilliseconds;
                results.Add(new { operation, duration, opsPerSecond = Config.Iterations / Math.Max(watch.Elapsed.TotalSeconds, 0.000001) });
            }
            await Events.EmitBroadcast("benchmark.results", obs, new { testName = "native-rpc", results, timestamp = DateTimeOffset.UtcNow.ToString("O") });
            obs.Log.Info("Benchmark complete: {results}", new() { ["results"] = results });
        } finally { _running.Release(); }
    }
}
