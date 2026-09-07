using AnyVali;
using BSB.Interfaces;
using System.Text.Json.Nodes;
using System.Text.Json;
using BSB.Base;
using BSB.Runtime;
using System.Reflection;
using System.Net;
using BSB.Tooling;

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}

Check(RegistryClient.ParsePluginId("@acme/service.worker") == ("@acme", "service.worker"), "Valid scoped/dotted Registry ID rejected");
foreach (var id in new[] { "../worker", "a/b/c", "worker\n" })
{
    try { RegistryClient.ParsePluginId(id); throw new Exception("Unsafe Registry ID accepted"); }
    catch (ArgumentException) { }
}

var registryTemp=Directory.CreateTempSubdirectory("bsb-registry-prerelease-").FullName;
try {
    var listener=new System.Net.Sockets.TcpListener(IPAddress.Loopback,0);listener.Start();
    var server=Task.Run(async()=>{
        foreach(var (path,body) in new[] { ("/plugins/acme/worker?language=rust","{\"plugin\":{\"version\":\"1.2.3-beta.1\"}}"), ("/plugins/acme/worker/1.2.3-beta.1/schema?language=rust","{\"pluginName\":\"worker\",\"version\":\"1.2.3-beta.1\",\"events\":{}}") }) {
            using var connection=await listener.AcceptTcpClientAsync();await using var stream=connection.GetStream();using var reader=new StreamReader(stream,leaveOpen:true);
            Check((await reader.ReadLineAsync())!.StartsWith("GET "+path+" "),"Registry exact-version route mismatch");while(!string.IsNullOrEmpty(await reader.ReadLineAsync())){}
            await stream.WriteAsync(System.Text.Encoding.UTF8.GetBytes($"HTTP/1.1 200 OK\r\nContent-Length: {body.Length}\r\nConnection: close\r\n\r\n{body}"));
        }
    });
    try {using var registry=new RegistryClient($"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}",allowInsecure:true);
        Check(File.Exists(await registry.Install(registryTemp,"acme/worker","rust")),"Prerelease client not installed");await server.WaitAsync(TimeSpan.FromSeconds(5));
    } finally {listener.Stop();}
}finally{Directory.Delete(registryTemp,true);}

var regenerateTemp=Directory.CreateTempSubdirectory("bsb-regenerate-").FullName;
try {
    var schemas=Path.Combine(regenerateTemp,".bsb","schemas");var clients=Path.Combine(regenerateTemp,"BsbClients");
    Directory.CreateDirectory(schemas);Directory.CreateDirectory(clients);
    const string registrySchema="""{"pluginName":"worker","version":"1.0.0","events":{}}""";
    await File.WriteAllTextAsync(Path.Combine(schemas,"old-name.json"),registrySchema);
    await File.WriteAllTextAsync(Path.Combine(clients,"Handwritten.cs"),"public class Handwritten { }");
    await RegistryClient.Regenerate(regenerateTemp);
    File.Move(Path.Combine(schemas,"old-name.json"),Path.Combine(schemas,"new-name.json"));
    await File.WriteAllTextAsync(Path.Combine(schemas,"invalid.json"),"not-json");
    try { await RegistryClient.Regenerate(regenerateTemp); throw new Exception("Invalid saved schema accepted"); }
    catch (JsonException) { }
    Check(File.Exists(Path.Combine(clients,"old-name.cs")) && !File.Exists(Path.Combine(clients,"new-name.cs")), "Regeneration wrote before validating all saved schemas");
    File.Delete(Path.Combine(schemas,"invalid.json"));
    await RegistryClient.Regenerate(regenerateTemp);
    Check(!File.Exists(Path.Combine(clients,"old-name.cs")) && File.Exists(Path.Combine(clients,"new-name.cs")) && File.Exists(Path.Combine(clients,"Handwritten.cs")),
        "Regeneration did not prune stale generated clients while preserving handwritten files");
    Directory.Delete(Path.Combine(regenerateTemp,".bsb"),true);
    await RegistryClient.Regenerate(regenerateTemp);
    Check(!File.Exists(Path.Combine(clients,"new-name.cs")) && File.Exists(Path.Combine(clients,"Handwritten.cs")),
        "Regeneration did not prune clients after all saved schemas were removed");
}finally{Directory.Delete(regenerateTemp,true);}
await HostedChecks.Run();

var schema = BSBTypes.Object(new() {
    ["items"] = BSBTypes.Array(BSBTypes.Int32(min: 1), minLength: 1),
    ["email"] = BSBTypes.Email(),
});
Check(JsonSerializer.Serialize(new OptionalFixture()) == "{}", "Unset optional property was serialized");
Check(BSBType.ToWireValue(JsonSerializer.SerializeToElement(ulong.MaxValue)) is ulong maximum && maximum == ulong.MaxValue, "UInt64 wire precision lost");
Check(JsonSerializer.Serialize(new OptionalFixture { Value = new OptionalValue<string?>(null) }) == "{\"Value\":null}", "Explicit optional null was omitted");
Check(JsonSerializer.Deserialize<OptionalFixture>("{\"Value\":null}")!.Value.IsSet && !JsonSerializer.Deserialize<OptionalFixture>("{}")!.Value.IsSet,
    "Deserialization lost optional property presence");
Check(schema.Validate(new { items = new[] { 1 }, email = "dev@example.com" }), "Valid typed payload rejected");
foreach (var invalid in new[] { "{}", "{\"items\":[],\"email\":\"dev@example.com\"}",
    "{\"items\":[\"1\"],\"email\":\"dev@example.com\"}", "{\"items\":[1],\"email\":\"bad\"}" })
    Check(!schema.Validate(JsonNode.Parse(invalid)), "Invalid nested payload accepted: " + invalid);
Check(!BSBTypes.Int32().Validate(2147483648L), "int32 overflow accepted");
Check(!BSBTypes.Number().Validate(true), "Boolean coerced to number");
Check(!BSBTypes.DateTime().Validate("yesterday"), "Invalid date accepted");
Check(!BSBTypes.Uri().Validate("file:///tmp/secret"), "Non-HTTP URL accepted");
Check(BSBType.Import(schema.ToAnyVali()).Validate(new { items = new[] { 2 }, email = "dev@example.com" }), "Schema roundtrip failed");

var document = JsonNode.Parse("""
{"anyvaliVersion":"1.0","schemaVersion":"1.1","root":{"kind":"object","properties":{
 "secret":{"kind":"string","metadata":{"sensitive":true}},
 "next":{"kind":"optional","inner":{"kind":"nullable","inner":{"kind":"ref","ref":"Node"}}}
},"required":["secret"]},"definitions":{"Node":{"kind":"object","properties":{"value":{"kind":"string"}},"required":["value"]}},"extensions":{}}
""")!.AsObject();
var imported = BSBType.Import(document);
var exported = imported.ToAnyVali();
Check(exported["definitions"]?["Node"] is not null, "Imported definitions lost");
Check(exported["root"]?["properties"]?["secret"]?["metadata"]?["sensitive"]?.GetValue<bool>() == true, "Sensitive metadata lost");
var encrypted = V.Encrypt(imported.ToSchema(), BSBType.ToWireValue(new { secret = "plain" }), (_, _) => "encrypted:value");
Check(((Dictionary<string, object?>)encrypted!)["secret"] as string == "encrypted:value", "Native sensitive transform not invoked");
Console.WriteLine("PASS: nested schema validation, numeric bounds, portable formats, definitions and sensitive transforms");

var events = new BSBEventSchemas { OnReturnableEvents = new() { ["orders.get"] = new(BSBTypes.String(), schema, 5) } };
var eventJson = events.Export("service-orders", "1.2.3").ToJson();
Check(eventJson.Contains("\"onReturnableEvents\"") && eventJson.Contains("\"defaultTimeout\""), "Event wire fields differ from Node");
var clientSchemas = BSBEventSchemas.Import(EventSchemaExport.FromJson(eventJson), client: true);
Check(clientSchemas.EmitReturnableEvents.ContainsKey("orders.get"), "Client event direction not flipped");
Check(clientSchemas.EmitReturnableEvents["orders.get"].Output.Validate(new { items = new[] { 1 }, email = "dev@example.com" }), "Exported output schema lost");
Console.WriteLine("PASS: portable event exports and client schema direction");
await RabbitChecks.Run();
await TelemetryChecks.Run();
await LifecycleChecks.Run();
await ExampleChecks.Run();

var traceObserver = new TestObserver();
var parentObs = new ObservableBackend("worker", "parent", new(), [traceObserver]);
var remoteTrace = DTrace.Generate();
var childObs = parentObs.StartSpan("receive", parent: remoteTrace);
childObs.Error(new InvalidOperationException("fixture-error"));
childObs.End(new() { ["result"] = "failed" });
childObs.End();
Check(traceObserver.Spans.Count == 1 && traceObserver.Spans[0].ParentSpanId == remoteTrace.SpanId &&
    childObs.TraceId == remoteTrace.TraceId && childObs.SpanId != remoteTrace.SpanId &&
    traceObserver.Spans[0].Error == "fixture-error" && traceObserver.Spans[0].Duration >= TimeSpan.Zero,
    "Completed span lost remote parent, error, duration or exported twice");
var traceJson = JsonSerializer.SerializeToNode(remoteTrace)!;
Check(traceJson["t"]!.GetValue<string>() == remoteTrace.TraceId && traceJson["s"]!.GetValue<string>() == remoteTrace.SpanId,
    "Distributed trace wire fields differ from Node");
Console.WriteLine("PASS: remote span parent, completion/export and Node trace wire format");

var ctor = new PluginConstructorArgs { AppId = "test", Cwd = ".", PluginName = "router", Mode = DebugMode.Development };
var router = new SBEvents(ctor);
var remote = new TestBackend(ctor, "remote");
var local = new TestBackend(ctor, "local");
router.AddPlugin(remote, JsonSerializer.SerializeToElement(new { emitEventAndReturn = new[] { "mapped" } }));
router.AddPlugin(local);
foreach (var malformed in new[] { "[1]", "{\"emitEvent\":[1]}", "{\"emitEvent\":{\"enabled\":true}}" })
{
    try { router.AddPlugin(local, JsonSerializer.Deserialize<JsonElement>(malformed)); throw new Exception("Malformed events filter accepted"); }
    catch (InvalidOperationException) { }
}
router.SetServices(new() { ["mapped"] = new() { Name = "mapped", Plugin = "service-orders", Enabled = false } });
Check(Equals(await router.EmitEventAndReturn("service-orders", "orders.get", null!, "x"), "remote:mapped"), "Remote alias did not select transport");
Check(Equals(await router.EmitEventAndReturn("unmapped", "get", null!, "x"), "local:unmapped"), "Fallback transport not selected");
var own = new PluginEvents("caller");
var client = own.CreateClient("service-orders", new BSBEventSchemas {
    OnReturnableEvents = new() { ["get"] = new(BSBTypes.Int32(), BSBTypes.String()) } }.Export("service-orders", "1.0.0"));
own.SetBackend(router);
Check(Equals(await client.EmitEventAndReturn("get", null!, 1), "remote:mapped"), "Constructor-created client did not resolve backend");
var ambiguousRouter = new SBEvents(ctor);
ambiguousRouter.AddPlugin(local);
ambiguousRouter.SetServices(new() {
    ["one"] = new() { Name = "one", Plugin = "service-orders", Enabled = true },
    ["two"] = new() { Name = "two", Plugin = "service-orders", Enabled = true },
});
try { await ambiguousRouter.EmitEventAndReturn("service-orders", "get", null!, "x"); throw new Exception("Ambiguous service reference accepted"); }
catch (InvalidOperationException error) when (error.Message.Contains("ambiguous")) { }
var canonicalRouter = new SBEvents(ctor);
canonicalRouter.AddPlugin(remote, JsonSerializer.SerializeToElement(new { emitEventAndReturn = new[] { "active" } }));
canonicalRouter.AddPlugin(local);
canonicalRouter.SetServices(new() {
    ["service-orders"] = new() { Name = "service-orders", Enabled = false },
    ["active"] = new() { Name = "active", Plugin = "service-orders", Enabled = true },
});
Check(Equals(await canonicalRouter.EmitEventAndReturn("service-orders", "get", null!, "x"), "remote:active"),
    "Disabled canonical entry shadowed enabled alias or selected the wrong transport");
Check(Equals(await ambiguousRouter.EmitEventAndReturn("one", "get", null!, "x"), "local:one"), "Explicit service alias did not override logical ambiguity");
ambiguousRouter.SetServices(new() {
    ["one"] = new() { Name = "one", Plugin = "service-orders", Enabled = false },
    ["two"] = new() { Name = "two", Plugin = "service-orders", Enabled = false },
});
try { await ambiguousRouter.EmitEventAndReturn("service-orders", "get", null!, "x"); throw new Exception("Ambiguous remote service reference accepted"); }
catch (InvalidOperationException error) when (error.Message.Contains("ambiguous")) { }
var slowStreams = new SlowStreamBackend(ctor);
var timedOut = new TaskCompletionSource<Exception?>(TaskCreationOptions.RunContinuationsAsynchronously);
await slowStreams.ReceiveStream("one", "slow", null!, (_, error, _) => { timedOut.SetResult(error); return Task.CompletedTask; }, 1);
Check(await timedOut.Task.WaitAsync(TimeSpan.FromSeconds(2)) is TimeoutException, "Compatibility stream timeout was ignored");
using var lateStream = new MemoryStream(); slowStreams.Complete(lateStream);
await Task.Delay(50);
Check(lateStream.CanRead, "Late compatibility receive disposed the sender's stream");
var calls = remote.Calls;
try { await client.EmitEventAndReturn("get", null!, "bad"); throw new Exception("Invalid input accepted"); }
catch (ValidationError) { }
Check(calls == remote.Calls, "Invalid input reached transport");
remote.Reply = 123;
try { await client.EmitEventAndReturn("get", null!, 1); throw new Exception("Invalid output accepted"); }
catch (ValidationError) { }
Console.WriteLine("PASS: filtered transport routing, remote aliases, late client wiring and bidirectional validation");

var configFixture = new TestConfig(ctor);
configFixture.Load(JsonNode.Parse("""
{"default":{"services":{"worker":{"plugin":"service-worker","enabled":true,"config":{"host":"default","nested":{"a":1}}}}},
 "production":{"services":{"worker":{"package":"Example.Worker","config":{"nested":{"b":2}}}}}}
""")!.AsObject(), "production");
var mergedConfig = (JsonElement)(await configFixture.GetPluginConfig(null!, PluginType.Service, "worker"))!;
Check(mergedConfig.GetProperty("nested").GetProperty("a").GetInt32() == 1 && mergedConfig.GetProperty("nested").GetProperty("b").GetInt32() == 2, "Profile config merge lost fields");
Check((await configFixture.GetServicePlugins(null!))["worker"].Package == "Example.Worker", "Profile package override ignored");
try { configFixture.Load(JsonNode.Parse("""{"services":{"bad":{"enabled":true,"language":"python"}}}""")!.AsObject(), "default"); throw new Exception("Wrong native plugin accepted"); }
catch (JsonException) { }
try { configFixture.Load(JsonNode.Parse("""{"services":{"worker":{}}}""")!.AsObject(), "production"); throw new Exception("Missing legacy profile accepted"); }
catch (JsonException) { }
Console.WriteLine("PASS: profile merging and native implementation validation");
try { configFixture.Load(JsonNode.Parse("""{"language":"python","services":{"worker":{}}}""")!.AsObject(), "default"); throw new Exception("Wrong host profile accepted"); }
catch (JsonException) { }
var overrideFixture = JsonNode.Parse("""{"default":{"services":{"worker":{"config":{"optional":null},"envOverridePaths":["allowed"]}}}}""")!.AsObject();
try { TestConfig.Overrides(overrideFixture,"""{"services":{"worker":{"optional":{}}}}"""); throw new Exception("Non-allowlisted empty object accepted"); }
catch (JsonException) { }

await using (var bus = new BSB.Plugins.EventsDefault.Plugin(ctor))
{
    var delivered = new List<string>();
    await bus.OnEvent("one", "same", null!, (_, _) => { delivered.Add("one"); return Task.CompletedTask; });
    await bus.OnEvent("two", "same", null!, (_, _) => { delivered.Add("two"); return Task.CompletedTask; });
    await bus.EmitEvent("two", "same", null!, null);
    Check(delivered.SequenceEqual(["two"]), "Local event escaped its plugin namespace");
    using var sent = new MemoryStream([1, 2, 3]);
    await bus.SendStream("one", "stream", null!, sent);
    Check(ReferenceEquals(sent, await bus.ReceiveStream("one", "stream", null!)), "Sender-first stream was lost");
    var receive = bus.ReceiveStream("two", "stream", null!);
    await bus.SendStream("two", "stream", null!, sent);
    Check(ReferenceEquals(sent, await receive), "Receiver-first stream was lost");
    var expired = new TaskCompletionSource<Exception?>(TaskCreationOptions.RunContinuationsAsynchronously);
    var callbacks = 0;
    var streamId = await bus.ReceiveStream("one", "late", null!, (_, error, _) =>
    { Interlocked.Increment(ref callbacks); expired.TrySetResult(error); return Task.CompletedTask; }, 1);
    Check(await expired.Task.WaitAsync(TimeSpan.FromSeconds(2)) is TimeoutException, "Local receiver deadline was ignored");
    await bus.SendStream("one", "late", null!, streamId, sent);
    await Task.Delay(50);
    Check(sent.CanRead && callbacks == 1, "Late sender lost ownership or expired callback ran twice");
    await bus.SendStream("one", "queued", null!, sent);
    var pending = bus.ReceiveStream("one", "pending", null!);
    await bus.DisposeAsync();
    Check(sent.CanRead, "Shutdown disposed a queued sender-owned stream");
    try { await pending; throw new Exception("Shutdown did not cancel pending stream"); }
    catch (OperationCanceledException) { }
    await bus.DisposeAsync();
    Console.WriteLine("PASS: local event namespaces, both stream orderings and shutdown cancellation");
}

var yamlDirectory = Directory.CreateTempSubdirectory("bsb-yaml-").FullName;
try
{
    await File.WriteAllTextAsync(Path.Combine(yamlDirectory, "sec-config.yaml"), """
    default:
      services:
        worker:
          plugin: service-worker
          enabled: true
          config:
            count: 3
    production:
      services:
        worker:
          config:
            value: production
    """);
    await using var yaml = new BSB.Plugins.ConfigDefault.Plugin(new PluginConstructorArgs {
        AppId = "test", Cwd = yamlDirectory, PluginName = "config-default", Mode = DebugMode.Development,
        RawConfig = new { BSB_PROFILE = "production" } });
    await yaml.Init(new ObservableBackend("test", "yaml", new(), new()));
    var value = (JsonElement)(await yaml.GetPluginConfig(null!, PluginType.Service, "worker"))!;
    Check(value.GetProperty("count").GetInt32() == 3 && value.GetProperty("value").GetString() == "production", "YAML profiles/scalars lost");
    Console.WriteLine("PASS: YAML scalar types and profile overrides");
}
finally { Directory.Delete(yamlDirectory, true); }

var logDirectory = Directory.CreateTempSubdirectory("bsb-logs-").FullName;
try
{
    var logFile = Path.Combine(logDirectory, "app.log");
    using (var writer = new RotatingLogFile(logFile, 30, 2, "none", true))
        for (var i = 0; i < 6; i++) writer.Write("{\"value\":\"test-entry-" + i + "\"}");
    var archives = Directory.GetFiles(logDirectory, "*.gz");
    Check(archives.Length == 2, "File rotation did not retain exactly two archives");
    foreach (var archive in archives)
    {
        using var input = File.OpenRead(archive);
        using var gzip = new System.IO.Compression.GZipStream(input, System.IO.Compression.CompressionMode.Decompress);
        using var reader = new StreamReader(gzip);
        Check(JsonNode.Parse(await reader.ReadToEndAsync())!["value"]!.GetValue<string>().StartsWith("test-entry"), "Compressed log lost data");
    }
    var entry = JsonNode.Parse("""{"meta":{"users":[{"secret":"one"},{"secret":"two"}]}}""")!.AsObject();
    StructuredLogging<object>.Redact(entry, ["meta.users.*.secret"]);
    Check(!entry.ToJsonString().Contains("one") && !entry.ToJsonString().Contains("two"), "Wildcard array redaction leaked a secret");
    var structured = new CaptureStructured(new ServiceConstructorArgs<object> { AppId = "test", Cwd = ".", PluginName = "capture", Mode = DebugMode.Development, Config = new() });
    structured.Info(default, "one", "token={token}", new LogMeta { ["token"] = "secret" });
    Check(structured.Entry!["message"]!.GetValue<string>() == "token=[REDACTED]", "Structured message interpolated before metadata redaction");
    Console.WriteLine("PASS: size rotation, gzip archives, retention and nested array redaction");
}
finally { Directory.Delete(logDirectory, true); }

var cacheDirectory = Directory.CreateTempSubdirectory("bsb-vault-native-").FullName;
try
{
    var vaultArgs = new PluginConstructorArgs { AppId = "test", Cwd = ".", PluginName = "config-vault", Mode = DebugMode.Development,
        RawConfig = new { vaultUrl = "https://vault.example", apiKeyId = "key", apiSecret = "fixture-secret", cacheDir = cacheDirectory } };
    const string validVault = """
    {"language":"csharp","application":"app","group":"api","profile":"production","version":1,
     "config":{"production":{"services":{"worker":{"enabled":true,"plugin":"service-worker","config":{"secret":"plaintext-marker"}}}}}}
    """;
    var observable = new ObservableBackend("test", "vault", new(), new());
    await using var vault = new TestVault(vaultArgs, HttpStatusCode.OK, validVault);
    await vault.Init(observable);
    var file = Directory.GetFiles(cacheDirectory).Single();
    Check(!(await File.ReadAllTextAsync(file)).Contains("plaintext-marker"), "Vault cache leaked plaintext");
    var before = await File.ReadAllBytesAsync(file);
    await using (var rejectedTls = new TlsVault(vaultArgs)) {
        try { await rejectedTls.Init(observable); throw new Exception("TLS failure fell back to cache"); }
        catch (HttpRequestException error) when (error.HttpRequestError == HttpRequestError.SecureConnectionError) { }
        Check(rejectedTls.Requests == 1, "TLS failure retried");
    }
    foreach (var (status, body) in new[] {
        (HttpStatusCode.Unauthorized, validVault), (HttpStatusCode.Redirect, validVault),
        (HttpStatusCode.OK, validVault.Replace("csharp", "nodejs")), (HttpStatusCode.OK, "not-json") })
    {
        await using var rejected = new TestVault(vaultArgs, status, body);
        try { await rejected.Init(observable); throw new Exception("Rejected Vault response fell back to cache"); }
        catch (Exception error) when (error is JsonException or InvalidOperationException) { }
        Check(Enumerable.SequenceEqual(before, await File.ReadAllBytesAsync(file)), "Rejected response replaced cache");
    }
    var readCache = typeof(BSB.Plugins.ConfigVault.Plugin).GetMethod("ReadCache", BindingFlags.Instance | BindingFlags.NonPublic)!;
    var restored = await (Task<JsonObject>)readCache.Invoke(vault, [new Uri("https://vault.example/runtime/config")])!;
    Check(restored["language"]!.GetValue<string>() == "csharp", "Encrypted cache roundtrip failed");
    var tampered = JsonNode.Parse(before)!.AsObject();
    tampered["tag"] = Convert.ToBase64String(new byte[16]);
    await File.WriteAllTextAsync(file, tampered.ToJsonString());
    try { await (Task<JsonObject>)readCache.Invoke(vault, [new Uri("https://vault.example/runtime/config")])!; throw new Exception("Tampered cache accepted"); }
    catch (System.Security.Cryptography.CryptographicException) { }
    await File.WriteAllBytesAsync(file, new byte[6 * 1024 * 1024 + 1]);
    try { await (Task<JsonObject>)readCache.Invoke(vault, [new Uri("https://vault.example/runtime/config")])!; throw new Exception("Oversized Vault cache accepted"); }
    catch (InvalidDataException) { }
    Console.WriteLine("PASS: Vault fetch, encrypted cache, authentication/redirect/language failures and tamper rejection");
    await using var google = new TestGoogleVault(vaultArgs, validVault);
    await google.Init(observable);
    Check(google.Refreshes == 1 && google.Requests == 2, "Google authentication did not refresh exactly once");
    Console.WriteLine("PASS: Google Vault sends both authentication headers and refreshes rejected identity once");
}
finally { Directory.Delete(cacheDirectory, recursive: true); }

var clientDirectory = Directory.CreateTempSubdirectory("bsb-client-compile-").FullName;
try
{
    try { await BsbCli.ReadDocumentation(clientDirectory, new()); throw new Exception("Missing publish docs accepted"); }
    catch (ArgumentException error) when (error.Message.Contains("requires documentation")) { }
    await File.WriteAllTextAsync(Path.Combine(clientDirectory, "README.md"), "# Public plugin\nUsage instructions");
    Check((await BsbCli.ReadDocumentation(clientDirectory, new()))[0]!.GetValue<string>().Contains("Usage instructions"), "README fallback missing from publish docs");
    await File.WriteAllTextAsync(Path.Combine(clientDirectory, "plugin.md"), "# Plugin-specific docs");
    Check((await BsbCli.ReadDocumentation(clientDirectory, new() { ["documentation"] = new JsonArray("plugin.md") }))[0]!.GetValue<string>() == "# Plugin-specific docs", "Explicit publish docs ignored");
    var contract = new BSBEventSchemas { OnReturnableEvents = new() {
        ["orders.get"] = new(BSBTypes.Object(new() { ["id"] = BSBTypes.Int32(), ["status"] = BSBTypes.Enum(["open", "closed"]) }), schema, 5) } };
    var portableContract = contract.Export("service-orders", "1.0.0");
    portableContract.Events["orders.get"].InputSchema!["root"]!["unknownKeys"] = "allow";
    portableContract.Events["orders.get"].InputSchema!["root"]!["properties"]!["additionalProperties"] = JsonNode.Parse("""{"kind":"optional","schema":{"kind":"string"}}""");
    portableContract.Events["orders.get"].InputSchema!["root"]!["properties"]!["note"] = JsonNode.Parse("""{"kind":"optional","schema":{"kind":"nullable","schema":{"kind":"string"}}}""");
    var generated = ClientGenerator.Generate(portableContract, "orders");
    Check(generated.Contains("OptionalValue<string?> Note"), "Python wrapper spelling lost optional/nullable client types");
    Check(generated.Contains("OptionalValue<string> AdditionalProperties") && generated.Contains("JsonElement>? AdditionalProperties_"), "Extension data collided with a contract property");
    await File.WriteAllTextAsync(Path.Combine(clientDirectory, "Orders.cs"), generated);
    var assemblyPath = System.Security.SecurityElement.Escape(typeof(ServiceBase).Assembly.Location);
    await File.WriteAllTextAsync(Path.Combine(clientDirectory, "Consumer.csproj"), $"""
    <Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable></PropertyGroup>
    <ItemGroup><Reference Include="BSB"><HintPath>{assemblyPath}</HintPath></Reference></ItemGroup></Project>
    """);
    var consumer = """
    public class Consumer {
      public void Call(BSB.Base.PluginEvents events, BSB.Interfaces.IObservable obs) {
        _ = new OrdersClient(events).OrdersGet(obs, new OrdersClientOrdersGetInput { Id = 1, Status = OrdersClientOrdersGetInputStatus.Open });
      }
    }
    """;
    await File.WriteAllTextAsync(Path.Combine(clientDirectory, "Consumer.cs"), consumer);
    async Task<(int Exit, string Output)> Compile()
    {
        var start = new System.Diagnostics.ProcessStartInfo("dotnet") { WorkingDirectory = clientDirectory, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        start.ArgumentList.Add("build"); start.ArgumentList.Add("--nologo");
        using var process = System.Diagnostics.Process.Start(start)!;
        var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync(); return (process.ExitCode, await stdout + await stderr);
    }
    var compiled = await Compile(); Check(compiled.Exit == 0, compiled.Output);
    await File.WriteAllTextAsync(Path.Combine(clientDirectory, "Consumer.cs"), consumer.Replace("Id = 1", "Id = \"wrong\""));
    compiled = await Compile(); Check(compiled.Exit != 0 && compiled.Output.Contains("CS0029"), "Generated client did not reject a wrong input type");
    Console.WriteLine("PASS: generated native client compiles and rejects invalid caller types");
}
finally { Directory.Delete(clientDirectory, recursive: true); }

var pluginDirectory = Directory.CreateTempSubdirectory("bsb-plugin-build-").FullName;
try
{
    var reference = System.Security.SecurityElement.Escape(typeof(ServiceBase).Assembly.Location);
    await File.WriteAllTextAsync(Path.Combine(pluginDirectory, "Example.csproj"), $"""
    <Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings>
    <EnableDynamicLoading>true</EnableDynamicLoading><AssemblyName>Example.Worker</AssemblyName><PackageId>Example.Worker</PackageId><Version>1.2.3-beta.1+build.7</Version></PropertyGroup>
    <ItemGroup><Reference Include="BSB"><HintPath>{reference}</HintPath><Private>false</Private></Reference></ItemGroup></Project>
    """);
    await File.WriteAllTextAsync(Path.Combine(pluginDirectory, "Plugin.cs"), """
    using BSB.Base; using BSB.Interfaces;
    public class Plugin : BSBService<object> {
      public new static BSBPluginMetadata Metadata => new() { Name = "service-worker", Description = "Fixture" };
      public Plugin(ServiceConstructorArgs<object> args) : base(args) { File.WriteAllText(Path.Combine(Cwd, "constructed"), "yes"); }
    }
    """);
    await BsbCli.Run(["plugin", "pack", "Example.csproj"], pluginDirectory);
    Check(!File.Exists(Path.Combine(pluginDirectory, "constructed")), "Build constructed the service");
    var manifest = JsonNode.Parse(await File.ReadAllTextAsync(Path.Combine(pluginDirectory, "bsb-plugin.json")))!;
    Check(manifest["csharp"]![0]!["assembly"]!.GetValue<string>() == "lib/Example.Worker.dll", "Build manifest lost assembly path");
    var loader = new SBPlugins(pluginDirectory);
    var resolvedAssembly = typeof(SBPlugins).GetMethod("ResolveAssemblyPath", BindingFlags.Instance | BindingFlags.NonPublic)!
        .Invoke(loader, [new PluginDefinition { Name = "worker", Plugin = "service-worker" }]) as string;
    Check(resolvedAssembly == Path.Combine(pluginDirectory, "lib", "Example.Worker.dll"), "Manifest-based assembly discovery failed");
    Check(File.Exists(Path.Combine(pluginDirectory, "lib", "schemas", "service-worker.json")), "Build did not export schema");
    using (var package = System.IO.Compression.ZipFile.OpenRead(Directory.GetFiles(Path.Combine(pluginDirectory, "packages"), "*.nupkg").Single()))
        Check(package.GetEntry("bsb/bsb-plugin.json") is not null && package.GetEntry("bsb/schemas/service-worker.json") is not null,
            "NuGet package omitted BSB metadata");
    var previousPluginDir = Environment.GetEnvironmentVariable("BSB_PLUGIN_DIR");
    var previousNuget = Environment.GetEnvironmentVariable("NUGET_PACKAGES");
    try
    {
        Environment.SetEnvironmentVariable("BSB_PLUGIN_DIR", Path.Combine(pluginDirectory, "installed"));
        Environment.SetEnvironmentVariable("NUGET_PACKAGES", Path.Combine(pluginDirectory, "nuget-cache"));
        var installed = await NativePackages.Install(pluginDirectory, "Example.Worker", "1.2.3-beta.1+build.7", Path.Combine(pluginDirectory, "packages"));
        var packageLoader = new SBPlugins(pluginDirectory);
        var resolvedPackage = typeof(SBPlugins).GetMethod("ResolveAssemblyPath", BindingFlags.Instance | BindingFlags.NonPublic)!
            .Invoke(packageLoader, [new PluginDefinition { Name = "worker", Plugin = "service-worker", Package = "Example.Worker", Version = "1.2.3-beta.1+build.7" }]) as string;
        Check(resolvedPackage == Path.Combine(installed, "Example.Worker.dll"), "Installed NuGet plugin was not discoverable");
        Check(await NativePackages.Install(pluginDirectory, "Example.Worker", "1.2.3-beta.1+build.7") == installed, "Native package install was not idempotent");
    }
    finally { Environment.SetEnvironmentVariable("BSB_PLUGIN_DIR", previousPluginDir); Environment.SetEnvironmentVariable("NUGET_PACKAGES", previousNuget); }
    Console.WriteLine("PASS: CLI builds/packs without starting services; installs native NuGet metadata and discovers its assembly");
}
finally { Directory.Delete(pluginDirectory, recursive: true); }

sealed class TestConfig(PluginConstructorArgs args) : JsonConfigProvider(args)
{
    public void Load(JsonObject document, string profile) => LoadConfig(document, profile);
    public static void Overrides(JsonObject document,string value) => ApplyOverrides(document,"default",value);
}
sealed class TlsVault(PluginConstructorArgs args) : BSB.Plugins.ConfigVault.Plugin(args) {
    public int Requests;
    protected override HttpMessageHandler CreateHandler() => new Handler(this);
    private sealed class Handler(TlsVault owner) : HttpMessageHandler {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token) {
            owner.Requests++;
            throw new HttpRequestException(HttpRequestError.SecureConnectionError,"TLS rejected",new System.Security.Authentication.AuthenticationException());
        }
    }
}
sealed class TestObserver() : BSBObservable<object>(new ServiceConstructorArgs<object> {
    AppId = "test", Cwd = ".", PluginName = "observer", Mode = DebugMode.Development, Config = new() })
{
    public List<CompletedSpan> Spans { get; } = new();
    public override void SpanEnded(CompletedSpan span) => Spans.Add(span);
}
sealed record OptionalFixture
{
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingDefault)]
    public OptionalValue<string?> Value { get; init; }
}
sealed class TestVault(PluginConstructorArgs args, HttpStatusCode status, string body) : BSB.Plugins.ConfigVault.Plugin(args)
{
    protected override HttpMessageHandler CreateHandler() => new VaultHandler(status, body);
}
sealed class VaultHandler(HttpStatusCode status, string body) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
    {
        if (!request.Headers.Contains("x-vault-key-id") || !request.Headers.Contains("x-vault-secret")) throw new Exception("Vault credentials missing");
        return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(body) });
    }
}
sealed class TestGoogleVault(PluginConstructorArgs args, string body) : BSB.Plugins.ConfigVaultGoogle.Plugin(args)
{
    public int Refreshes { get; private set; }
    public int Requests { get; private set; }
    protected override Task<string> GoogleToken(bool refresh, CancellationToken token)
    {
        if (refresh) Refreshes++;
        return Task.FromResult(refresh ? "refreshed" : "initial");
    }
    protected override HttpMessageHandler CreateHandler() => new GoogleHandler(this, body);
    private sealed class GoogleHandler(TestGoogleVault owner, string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            owner.Requests++;
            var expected = owner.Requests == 1 ? "Bearer initial" : "Bearer refreshed";
            if (!request.Headers.Contains("x-vault-secret") || request.Headers.GetValues("X-Serverless-Authorization").Single() != expected)
                throw new Exception("Google Vault authentication headers incorrect");
            return Task.FromResult(new HttpResponseMessage(owner.Requests == 1 ? HttpStatusCode.Unauthorized : HttpStatusCode.OK) { Content = new StringContent(body) });
        }
    }
}

class TestBackend(PluginConstructorArgs args, string label) : BSBEvents(args)
{
    public int Calls { get; private set; }
    public object? Reply { get; set; }
    public override Task<object?> EmitEventAndReturn(string plugin, string name, IObservable obs, object? data, int timeoutSeconds = 30)
    { Calls++; return Task.FromResult<object?>(Reply ?? $"{label}:{plugin}"); }
    public override Task OnEvent(string p, string n, IObservable o, BSB.Base.EventHandler h) => Task.CompletedTask;
    public override Task EmitEvent(string p, string n, IObservable o, object? d) => Task.CompletedTask;
    public override Task OnReturnableEvent(string p, string n, IObservable o, ReturnableEventHandler h) => Task.CompletedTask;
    public override Task OnBroadcast(string p, string n, IObservable o, BroadcastHandler h) => Task.CompletedTask;
    public override Task EmitBroadcast(string p, string n, IObservable o, object? d) => Task.CompletedTask;
    public override Task<Stream> ReceiveStream(string p, string n, IObservable o) => throw new NotSupportedException();
    public override Task SendStream(string p, string n, IObservable o, Stream d) => throw new NotSupportedException();
}
sealed class SlowStreamBackend(PluginConstructorArgs args) : TestBackend(args, "slow")
{
    private readonly TaskCompletionSource<Stream> _stream = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public void Complete(Stream stream) => _stream.SetResult(stream);
    public override Task<Stream> ReceiveStream(string p, string n, IObservable o) => _stream.Task;
}
sealed class CaptureStructured(ServiceConstructorArgs<object> args) : StructuredLogging<object>(args)
{
    public JsonObject? Entry { get; private set; }
    protected override void Write(JsonObject entry) { Redact(entry, ["meta.token"]); Interpolate(entry); Entry = entry; }
}
