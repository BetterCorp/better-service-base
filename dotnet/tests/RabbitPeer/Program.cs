using BSB.Base;
using BSB.Interfaces;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;

var endpoint = new Uri(Environment.GetEnvironmentVariable("BSB_RABBITMQ_URL") ?? throw new Exception("BSB_RABBITMQ_URL required"));
var credentials = endpoint.UserInfo.Split(':', 2);
var obs = new ObservableBackend("csharp", "interop", new(), new());
await using var rabbit = new BSB.Plugins.EventsRabbitMQ.Plugin(new PluginConstructorArgs {
    AppId = "interop", Cwd = ".", PluginName = "events-rabbitmq", Mode = DebugMode.Development,
    RawConfig = new { platformKey = Environment.GetEnvironmentVariable("BSB_INTEROP_PLATFORM"), endpoints = new[] { endpoint.ToString() },
        credentials = new { username = Uri.UnescapeDataString(credentials[0]), password = Uri.UnescapeDataString(credentials.ElementAtOrDefault(1) ?? "") } }
});
static JsonObject Input(object? value) => JsonSerializer.SerializeToNode(value)!.AsObject();
await rabbit.Init(obs);
string? received = null;
var bytes = Enumerable.Range(0, 1024 * 1024).Select(i => (byte)(i % 256)).ToArray();
await rabbit.OnReturnableEvent("csharp", "echo", obs, (span, value) => Task.FromResult<object?>(new { value, trace = span.Trace.TraceId }));
await rabbit.OnReturnableEvent("csharp", "call", obs, async (span, value) => {
    var input = Input(value); return await rabbit.EmitEventAndReturn(input["target"]!.GetValue<string>(), "echo", span, input["value"], 10);
});
await rabbit.OnReturnableEvent("csharp", "crash", obs, async (_, value) => {
    if (Environment.GetEnvironmentVariable("BSB_INTEROP_CRASH_FIRST") == "true") { Console.WriteLine("CRASH_READY"); await Task.Delay(Timeout.Infinite); }
    return value;
});
await rabbit.OnReturnableEvent("csharp", "receive", obs, async (span, _) => {
    received = null;
    return await rabbit.ReceiveStream("csharp", "file", span, async (_, error, stream) => {
        if (error is not null) throw error;
        received = Convert.ToHexStringLower(await SHA256.HashDataAsync(stream!));
    }, 5);
});
await rabbit.OnReturnableEvent("csharp", "digest", obs, (_, _) => Task.FromResult<object?>(received));
await rabbit.OnReturnableEvent("csharp", "send", obs, async (span, value) => {
    var input = Input(value);
    using var stream = new MemoryStream(bytes);
    await rabbit.SendStream(input["target"]!.GetValue<string>(), "file", span, input["id"]!.GetValue<string>(), stream);
    return true;
});
Console.WriteLine("READY");
await Console.In.ReadLineAsync();
