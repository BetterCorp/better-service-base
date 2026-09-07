using BSB.Base;
using BSB.Interfaces;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.IO.Compression;
using System.Net.Security;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

static class TelemetryChecks
{
    private static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    private static ServiceConstructorArgs<T> Args<T>(T config, string name = "exporter") => new() {
        Config = config, AppId = "telemetry-test", PluginName = name, Cwd = ".", Mode = DebugMode.Development };
    public static async Task Run()
    {
        await CheckTls();
        var capture = new Capture();
        string[] redact = ["meta.token", "attributes.token", "attributes.users.*.secret", "error"];
        var attributes = new Dictionary<string, object?> { ["token"] = "span-secret", ["public"] = "retained",
            ["users"] = new[] { new Dictionary<string, object?> { ["secret"] = "nested-secret" } } };
        var exporter = new Otlp(Args(new TelemetryConfig { Endpoint = "https://collector.example", ServiceName = "fixture", Redact = redact }), capture);
        var obs = new ObservableBackend("one", "root", new(), [exporter]);
        await exporter.Init(obs);
        obs.Log.Info("token={token}", new LogMeta { ["token"] = "secret" });
        var child = obs.StartSpan("child", attributes); child.End();
        var counter = obs.Metrics.Counter("requests", "request count", "1"); counter.Increment(2); counter.Increment(3, new());
        var second = new ObservableBackend("two", "root", new(), [exporter]);
        second.Metrics.Counter("requests", "request count", "1").Increment(7);
        var histogram = obs.Metrics.Histogram("latency", "duration", "ms"); histogram.Record(2); histogram.Record(4);
        await exporter.DisposeAsync();
        Check(capture.Requests.Count == 3, "OTLP did not export all three signals");
        var traces = capture.Requests.Single(x => x.Path == "/v1/traces").Body;
        var log = capture.Requests.Single(x => x.Path == "/v1/logs").Body["resourceLogs"]![0]!["scopeLogs"]![0]!["logRecords"]![0]!;
        Check(log["body"]!["stringValue"]!.GetValue<string>() == "token=[REDACTED]", "HTTP log interpolated before metadata redaction");
        var span = traces["resourceSpans"]![0]!["scopeSpans"]![0]!["spans"]![0]!;
        Check(span["traceId"]!.GetValue<string>() == obs.TraceId && span["spanId"]!.GetValue<string>() == child.SpanId &&
            span["parentSpanId"]!.GetValue<string>() == obs.SpanId && span["startTimeUnixNano"]!.GetValueKind() == JsonValueKind.String, "OTLP span lost IDs/parent/nanosecond encoding");
        CheckRedactedSpan(traces);
        Check(span["status"]!["code"]!.GetValue<int>() == 0, "Error redaction marked a successful span as failed");
        var scopes = capture.Requests.Single(x => x.Path == "/v1/metrics").Body["resourceMetrics"]![0]!["scopeMetrics"]!.AsArray();
        Check(scopes.Select(x => x!["scope"]!["name"]!.GetValue<string>()).Distinct().Count() == 2, "Plugin metric scopes collided");
        var metrics = scopes.SelectMany(x => x!["metrics"]!.AsArray()).ToArray();
        var requests = metrics.Where(x => x!["name"]!.GetValue<string>() == "requests").ToArray();
        Check(requests.Length == 2 && requests.Select(x => x!["sum"]!["dataPoints"]![0]!["asDouble"]!.GetValue<double>()).Order().SequenceEqual(new[] { 5d, 7d }),
            "Metric accumulation mixed plugin namespaces or lost increments");
        var hist = metrics.Single(x => x!["name"]!.GetValue<string>() == "latency")!["histogram"]!["dataPoints"]![0]!;
        Check(hist["count"]!.GetValue<string>() == "2" && hist["sum"]!.GetValue<double>() == 6, "Histogram cumulative snapshot is invalid");

        var axiomCapture = new Capture();
        var axiom = new Axiom(Args(new BSB.Plugins.Axiom.AxiomConfig { Endpoint = "https://api.axiom.co", Token = "fixture-token", Dataset = "fixture", Redact = redact }), axiomCapture);
        await axiom.Init(obs); axiom.Info(obs.Trace, "one", "axiom");
        var completed = new CompletedSpan(child.Trace, obs.SpanId, "one", "trace", new(), DateTimeOffset.UtcNow, TimeSpan.FromMilliseconds(2), attributes, "error-secret");
        axiom.SpanEnded(completed);
        await axiom.DisposeAsync();
        Check(axiomCapture.Requests.Count == 2 && axiomCapture.Requests.All(x => x.Authorization == "Bearer fixture-token") &&
            axiomCapture.Requests.Any(x => x.Path == "/v1/datasets/fixture/ingest"), "Axiom ingestion or authorization differs from its API");
        var axiomTraces = axiomCapture.Requests.Single(x => x.Path == "/v1/traces").Body;
        CheckRedactedSpan(axiomTraces);
        Check(axiomTraces["resourceSpans"]![0]!["scopeSpans"]![0]!["spans"]![0]!["status"]!["message"]!.GetValue<string>() == "[REDACTED]", "Axiom span error was not redacted");
        var zipkinCapture = new Capture();
        var zipkin = new Zipkin(Args(new TelemetryConfig { Endpoint = "https://zipkin.example/api/v2/spans", Redact = redact }), zipkinCapture);
        await zipkin.Init(obs);
        zipkin.SpanEnded(completed);
        await zipkin.DisposeAsync();
        var zippedSpan = zipkinCapture.Requests.Single().Body[0]!;
        Check(zippedSpan["id"]!.GetValue<string>() == child.SpanId && zippedSpan["duration"]!.GetValue<long>() == 2000 && zippedSpan["tags"]!["error"]!.GetValue<string>() == "[REDACTED]",
            "Zipkin IDs, microsecond duration or error tags are invalid");
        Check(zippedSpan["tags"]!["token"]!.GetValue<string>() == "[REDACTED]" && zippedSpan["tags"]!["public"]!.GetValue<string>() == "retained", "Zipkin span attribute redaction failed");
        CheckRedactedSpan(zippedSpan);
        Check((string)attributes["token"]! == "span-secret" && completed.Error == "error-secret" &&
            (string)((Dictionary<string, object?>[])attributes["users"]!)[0]["secret"]! == "nested-secret", "Exporter redaction mutated the shared span");

        foreach (var status in new[] { HttpStatusCode.Redirect, HttpStatusCode.Unauthorized })
        {
            var handler = new Capture(status); using var client = new TelemetryHttp(handler);
            try { await client.Post(new Uri("https://collector.example"), new { }, null, default); throw new Exception("HTTP rejection accepted"); }
            catch (HttpRequestException) { }
            Check(handler.Requests.Count == 1, "Authentication/redirect failure was retried");
        }
        var partial = new Capture(HttpStatusCode.OK, """{"partialSuccess":{"rejectedSpans":"1"}}""");
        foreach (var date in new[] { false, true })
        {
            var retry = new RetryAfterCapture(date);
            using var client = new TelemetryHttp(retry);
            using var budget = new CancellationTokenSource(TimeSpan.FromSeconds(8));
            await client.Post(new Uri("https://collector.example"), new { }, null, budget.Token);
            Check(retry.Calls == 2, "Large Retry-After prevented bounded retry");
        }
        using (var client = new TelemetryHttp(partial))
        {
            try { await client.Post(new Uri("https://collector.example"), new { }, null, default); throw new Exception("Partial rejection accepted"); }
            catch (InvalidDataException) { }
            Check(partial.Requests.Count == 1, "Partial-success batch was retried");
        }

        using var listener = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var incoming = listener.ReceiveAsync(timeout.Token);
        var syslog = new BSB.Plugins.Syslog.Plugin(Args(new BSB.Plugins.Syslog.SyslogConfig { Host = "127.0.0.1", Port = ((IPEndPoint)listener.Client.LocalEndPoint!).Port }));
        syslog.Info(obs.Trace, "one", "syslog test"); await syslog.DisposeAsync();
        var packet = Encoding.UTF8.GetString((await incoming).Buffer);
        Check(packet.StartsWith("<134>1 ") && packet.Contains(obs.TraceId), "Native syslog UDP framing or trace context is invalid");
        var entry = JsonSerializer.SerializeToNode(new { timestamp = DateTimeOffset.UtcNow.ToString("O"), level = "info", plugin = "one", message = new string('x', 5000) })!.AsObject();
        var tlsNewline = BSB.Plugins.Syslog.Plugin.Format(entry, new() { Protocol = "tls", Framing = "newline" });
        var tcpOctets = BSB.Plugins.Syslog.Plugin.Format(entry, new() { Protocol = "tcp", Framing = "octet-counting" });
        Check(tlsNewline[^1] == (byte)'\n' && tcpOctets.TakeWhile(x => x != (byte)' ').All(x => char.IsAsciiDigit((char)x)), "Syslog ignored configured stream framing");
        var gelf = BSB.Plugins.Graylog.Plugin.Format(entry, new());
        var chunks = BSB.Plugins.Graylog.Plugin.DatagramChunks(gelf, false);
        Check(chunks.Length > 1 && chunks.All(x => x[0] == 0x1e && x[1] == 0x0f && x[11] == chunks.Length && x.Length <= 1200), "GELF chunk header invalid");
        Check(JsonNode.Parse(chunks.SelectMany(x => x.Skip(12)).ToArray())!["version"]!.GetValue<string>() == "1.1", "GELF chunks did not reconstruct the message");
        var compressed = BSB.Plugins.Graylog.Plugin.DatagramChunks(gelf, true).Single();
        using var gzip = new GZipStream(new MemoryStream(compressed), CompressionMode.Decompress);
        using var reader = new StreamReader(gzip);
        Check(JsonNode.Parse(await reader.ReadToEndAsync())!["level"]!.GetValue<int>() == 6, "Compressed GELF severity is invalid");
        Console.WriteLine("PASS: OTLP/Axiom/Zipkin payloads, cumulative plugin metrics, HTTP failure rules, real UDP syslog and GELF chunking/compression");
    }
    private static void CheckRedactedSpan(JsonNode span)
    {
        var json = span.ToJsonString();
        Check(!json.Contains("span-secret") && !json.Contains("nested-secret") && !json.Contains("error-secret") &&
            json.Contains("[REDACTED]") && json.Contains("retained"), "HTTP span leaked a redacted field or lost public attributes");
    }
    private static async Task CheckTls()
    {
        using var caKey = RSA.Create(2048);
        var caRequest = new CertificateRequest("CN=BSB test CA", caKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        caRequest.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, false, 0, true));
        caRequest.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.KeyCertSign, true));
        using var ca = caRequest.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(1));
        using var serverKey = RSA.Create(2048);
        var request = new CertificateRequest("CN=localhost", serverKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var names = new SubjectAlternativeNameBuilder(); names.AddDnsName("localhost");
        request.CertificateExtensions.Add(names.Build());
        request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(new OidCollection { new("1.3.6.1.5.5.7.3.1") }, false));
        using var publicServer = request.Create(ca, DateTimeOffset.UtcNow.AddHours(-1), DateTimeOffset.UtcNow.AddHours(1), RandomNumberGenerator.GetBytes(16));
        using var keyedServer = publicServer.CopyWithPrivateKey(serverKey);
        // Schannel needs a persisted private key for server authentication on Windows.
        using var server = X509CertificateLoader.LoadPkcs12(keyedServer.Export(X509ContentType.Pfx), null);
        var directory = Directory.CreateTempSubdirectory("bsb-tls-").FullName;
        try
        {
            var caPath = Path.Combine(directory, "ca.pem"); await File.WriteAllTextAsync(caPath, ca.ExportCertificatePem());
            foreach (var (host, trust, accepted) in new[] { ("localhost", caPath, true), ("127.0.0.1", caPath, false), ("localhost", (string?)null, false) })
            {
                using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
                var receive = Task.Run(async () => {
                    try {
                        using var client = await listener.AcceptTcpClientAsync(deadline.Token);
                        using var stream = new SslStream(client.GetStream());
                        await stream.AuthenticateAsServerAsync(new SslServerAuthenticationOptions { ServerCertificate = server }, deadline.Token);
                        var data = new byte[4]; await stream.ReadExactlyAsync(data, deadline.Token);
                        return Encoding.UTF8.GetString(data);
                    } catch (Exception error) when (error is AuthenticationException or IOException) { return "rejected"; }
                });
                await using var sender = new NetworkProbe(Args(new NetworkLoggingConfig {
                    Host = host, Port = ((IPEndPoint)listener.LocalEndpoint).Port, Protocol = "tls", CaCertificatePath = trust }));
                var succeeded = true;
                try { await sender.SendTest(deadline.Token); }
                catch (AuthenticationException) { succeeded = false; }
                Check(succeeded == accepted, "TLS custom CA/hostname/system trust validation failed");
                Check(await receive == (accepted ? "test" : "rejected"), "TLS sent data before server authentication");
            }
        }
        finally { Directory.Delete(directory, true); }
        Console.WriteLine("PASS: real TLS custom CA, hostname mismatch and untrusted certificate rejection");
    }
    sealed class NetworkProbe(ServiceConstructorArgs<NetworkLoggingConfig> args) : NetworkLogging<NetworkLoggingConfig>(args)
    {
        public Task SendTest(CancellationToken token) => Send(Encoding.UTF8.GetBytes("test"), token);
        protected override Task Export(IReadOnlyList<JsonObject> batch, CancellationToken token) => Task.CompletedTask;
    }
    sealed class Otlp(ServiceConstructorArgs<TelemetryConfig> args, Capture capture) : BSB.Plugins.OpenTelemetry.Plugin(args)
    { protected override HttpMessageHandler CreateHandler() => capture; }
    sealed class Axiom(ServiceConstructorArgs<BSB.Plugins.Axiom.AxiomConfig> args, Capture capture) : BSB.Plugins.Axiom.Plugin(args)
    { protected override HttpMessageHandler CreateHandler() => capture; }
    sealed class Zipkin(ServiceConstructorArgs<TelemetryConfig> args, Capture capture) : BSB.Plugins.Zipkin.Plugin(args)
    { protected override HttpMessageHandler CreateHandler() => capture; }
    sealed class RetryAfterCapture(bool date) : HttpMessageHandler
    {
        public int Calls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            var response = new HttpResponseMessage(++Calls == 1 ? HttpStatusCode.ServiceUnavailable : HttpStatusCode.OK);
            response.Content = new StringContent("{}");
            if (Calls == 1) response.Headers.RetryAfter = date
                ? new System.Net.Http.Headers.RetryConditionHeaderValue(DateTimeOffset.UtcNow.AddYears(1))
                : new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.FromDays(365));
            return Task.FromResult(response);
        }
    }
    sealed class Capture(HttpStatusCode status = HttpStatusCode.OK, string response = "{}") : HttpMessageHandler
    {
        public readonly List<(string Path, JsonNode Body, string? Authorization)> Requests = new();
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            Requests.Add((request.RequestUri!.AbsolutePath, JsonNode.Parse(await request.Content!.ReadAsStringAsync(token))!, request.Headers.Authorization?.ToString()));
            return new(status) { Content = new StringContent(response, Encoding.UTF8, "application/json") };
        }
    }
}
