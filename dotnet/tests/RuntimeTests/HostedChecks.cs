using BSB.Tooling;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

static class HostedChecks
{
    private const string Schema = """{"pluginId":"service-reports","version":"1.2.3-beta.1","events":{"lookup":{"type":"returnable","category":"onReturnableEvents","inputSchema":{"anyvaliVersion":"1.0","schemaVersion":"1.1","root":{"kind":"string"},"definitions":{},"extensions":{}},"outputSchema":{"anyvaliVersion":"1.0","schemaVersion":"1.1","root":{"kind":"string"},"definitions":{},"extensions":{}}}}}""";
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); }

    public static async Task Run()
    {
        var cwd = Directory.CreateTempSubdirectory("bsb-hosted-").FullName;
        try
        {
            var schemas = 0;
            using var server = new LocalServer(4, request => request.Target switch {
                "/.well-known/bsb" => (200, """{"bsb":1,"plugins":[{"id":"acme/service-reports","language":"nodejs","version":"1.2.3-beta.1","schema":"/contracts/reports.json"}]}"""),
                "/contracts/reports.json" => (200, ++schemas == 1 ? Schema : Schema.Replace("lookup", "refreshed")),
                _ => (404, "{}"),
            });
            var previousToken = Environment.GetEnvironmentVariable("BSB_REGISTRY_TOKEN");
            try
            {
                Environment.SetEnvironmentVariable("BSB_REGISTRY_TOKEN", "must-not-leak");
                await BsbCli.Run(["client", "install", server.Origin, "--plugin", "acme/service-reports", "--source-language", "nodejs", "--version", "1.2.3-beta.1", "--allow-insecure"], cwd);
                var installed = Directory.GetFiles(Path.Combine(cwd, "BsbClients"), "*.cs").Single();
                Check(File.Exists(installed), "Hosted client was not generated");
                Check(server.Requests.All(request => !request.Headers.ContainsKey("Authorization")), "Registry credentials reached hosted origin");
                await HostedClient.Install(cwd, server.Origin, "acme/service-reports", "nodejs", "1.2.3-beta.1", allowInsecure: true);
                Check((await File.ReadAllTextAsync(Directory.GetFiles(Path.Combine(cwd, ".bsb", "schemas"), "*.json").Single())).Contains("refreshed"), "Hosted reinstall did not refresh its snapshot");
            }
            finally { Environment.SetEnvironmentVariable("BSB_REGISTRY_TOKEN", previousToken); }
            await server.WaitAsync(TimeSpan.FromSeconds(5));
            await RegistryClient.Regenerate(cwd);
            Check(File.Exists(Directory.GetFiles(Path.Combine(cwd, "BsbClients"), "*.cs").Single()), "Offline hosted snapshot regeneration failed");

            var inlineDiscovery = JsonSerializer.Serialize(new { bsb = 1, plugins = new[] { new { id = "acme/inline", language = "nodejs", version = "1.2.3-beta.1", schema = JsonSerializer.Deserialize<JsonElement>(Schema) } } });
            using (var inline = new LocalServer(1, _ => (200, inlineDiscovery)))
            {
                var inlineCwd = Directory.CreateTempSubdirectory("bsb-hosted-inline-").FullName;
                try { Check(File.Exists(await HostedClient.Install(inlineCwd, inline.Origin, allowInsecure: true)), "Inline hosted schema was not generated"); }
                finally { Directory.Delete(inlineCwd, true); }
                await inline.WaitAsync(TimeSpan.FromSeconds(5));
            }

            await Reject("""{"bsb":1,"plugins":[{"id":"acme/one","language":"nodejs","version":"1.0.0","schema":{}},{"id":"acme/two","language":"nodejs","version":"1.0.0","schema":{}}]}""", null, typeof(InvalidOperationException), "Ambiguous hosted selection accepted");
            await Reject("""{"bsb":1,"plugins":[{"id":"../bad","language":"nodejs","version":"1.0.0","schema":{}}]}""", null, typeof(ArgumentException), "Invalid hosted metadata accepted");
            await Reject("""{"bsb":1,"plugins":[{"id":"acme/one","language":"nodejs","version":"1.0.0","schema":{"events":[]}}]}""", null, typeof(JsonException), "Invalid hosted schema accepted");
            await Reject("""{"bsb":1,"plugins":[{"id":"acme/one","language":"nodejs","version":"1.0.0","schema":[]},{"id":"acme/two","language":"nodejs","version":"1.0.0","schema":{}}]}""", "acme/two", typeof(JsonException), "Invalid unselected hosted schema metadata accepted");
            await Reject("""{"bsb":1,"plugins":[{"id":"foo","language":"nodejs","version":"1.0.0","schema":{}},{"id":"_/foo","language":"nodejs","version":"1.0.0","schema":{}}]}""", null, typeof(JsonException), "Equivalent hosted identities were accepted twice");
            await Reject("""{"bsb":1,"plugins":[{"id":"acme/one","language":"nodejs","version":"1.0.0","schema":{"pluginId":"acme/qualified","version":"1.0.0","events":{}}}]}""", null, typeof(JsonException), "Qualified hosted wire target accepted");
            await Reject("""{"bsb":1,"plugins":[{"id":"acme/one","language":"nodejs","version":"1.0.0","schema":{"version":"2.0.0","events":{}}}]}""", null, typeof(JsonException), "Mismatched hosted schema version accepted");
            await Reject("""{"bsb":1,"plugins":[{"id":"acme/one","language":"nodejs","version":"1.0.0","schema":"http://example.invalid/schema"}]}""", null, typeof(ArgumentException), "Cross-origin hosted schema accepted");
            using (var redirect = new LocalServer(1, _ => (302, "{}")))
            {
                try { await HostedClient.Install(cwd, redirect.Origin, allowInsecure: true); throw new Exception("Hosted redirect accepted"); }
                catch (HttpRequestException) { }
                await redirect.WaitAsync(TimeSpan.FromSeconds(5));
            }
            Console.WriteLine("PASS: hosted client discovery selection, same-origin schemas, redirects, credential isolation and offline regeneration");
        }
        finally { Directory.Delete(cwd, true); }
    }

    private static async Task Reject(string discovery, string? plugin, Type error, string message)
    {
        var cwd = Directory.CreateTempSubdirectory("bsb-hosted-reject-").FullName;
        using var server = new LocalServer(1, _ => (200, discovery));
        try
        {
            try { await HostedClient.Install(cwd, server.Origin, plugin, allowInsecure: true); throw new Exception(message); }
            catch (Exception caught) when (caught.GetType() == error) { }
            await server.WaitAsync(TimeSpan.FromSeconds(5));
        }
        finally { Directory.Delete(cwd, true); }
    }

    private sealed record Request(string Target, Dictionary<string, string> Headers);
    private sealed class LocalServer : IDisposable
    {
        private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
        private readonly Task _serve;
        public List<Request> Requests { get; } = new();
        public string Origin => "http://127.0.0.1:" + ((IPEndPoint)_listener.LocalEndpoint).Port;
        public LocalServer(int count, Func<Request, (int Status, string Body)> reply)
        {
            _listener.Start();
            _serve = Task.Run(async () => {
                for (var i = 0; i < count; i++)
                {
                    using var client = await _listener.AcceptTcpClientAsync(); await using var stream = client.GetStream();
                    using var reader = new StreamReader(stream, leaveOpen: true); var request = (await reader.ReadLineAsync())!.Split(' ');
                    var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    for (string? line; !string.IsNullOrEmpty(line = await reader.ReadLineAsync());) { var colon = line.IndexOf(':'); if (colon > 0) headers[line[..colon]] = line[(colon + 1)..].Trim(); }
                    var received = new Request(request[1], headers); Requests.Add(received); var response = reply(received); var bytes = Encoding.UTF8.GetBytes(response.Body);
                    await stream.WriteAsync(Encoding.UTF8.GetBytes($"HTTP/1.1 {response.Status} OK\r\nContent-Type: application/json\r\nContent-Length: {bytes.Length}\r\nConnection: close\r\n\r\n")); await stream.WriteAsync(bytes);
                }
            });
        }
        public Task WaitAsync(TimeSpan timeout) => _serve.WaitAsync(timeout);
        public void Dispose() { _listener.Stop(); }
    }
}
