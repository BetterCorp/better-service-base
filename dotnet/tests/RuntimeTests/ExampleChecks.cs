using BSB.Base;
using BSB.Examples;
using BSB.Interfaces;
using BSB.Runtime;
using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json.Nodes;

static class ExampleChecks
{
    public static async Task Run()
    {
        var directory = Directory.CreateTempSubdirectory("bsb-examples-").FullName;
        try
        {
            ServiceConstructorArgs<T> Args<T>(string name, T config) => new() { AppId = "test", PluginName = name, Cwd = directory, Mode = DebugMode.Development, Config = config };
            var ctor = new PluginConstructorArgs { AppId = "test", PluginName = "events", Cwd = directory, Mode = DebugMode.Development };
            await using var observable = new SBObservable();
            await using var router = new SBEvents(ctor);
            router.AddPlugin(new BSB.Plugins.EventsDefault.Plugin(ctor));
            router.SetServices(new() {
                ["zero"] = new() { Name = "zero", Plugin = "service-default0" },
                ["one"] = new() { Name = "one", Plugin = "service-default1" },
                ["two"] = new() { Name = "two", Plugin = "service-default2" },
                ["three"] = new() { Name = "three", Plugin = "service-default3" },
                ["four"] = new() { Name = "four", Plugin = "service-default4" },
                ["bench"] = new() { Name = "bench", Plugin = "service-benchmarkify" },
                ["todo"] = new() { Name = "todo", Plugin = "service-demo-todo" },
            });
            using var reservation = new TcpListener(IPAddress.Loopback, 0); reservation.Start();
            var port = ((IPEndPoint)reservation.LocalEndpoint).Port; reservation.Stop();
            await using (var services = new SBServices())
            {
                services.AddService("zero", new Default0(Args("zero", new Default0Config { Testa = 2, Testb = 3 })), Default0.Metadata);
                services.AddService("three", new Default3(Args<object>("three", new())), Default3.Metadata);
                services.AddService("two", new Default2(Args<object>("two", new())), Default2.Metadata);
                services.AddService("one", new Default1(Args<object>("one", new())), Default1.Metadata);
                services.AddService("four", new Default4(Args<object>("four", new())), Default4.Metadata);
                services.AddService("bench", new Benchmark(Args("bench", new BenchmarkConfig { Iterations = 5 })), Benchmark.Metadata);
                services.AddService("todo", new Todo(Args("todo", new TodoConfig { Storage = new() { Path = "todos.json" }, Http = new() { Host = "127.0.0.1", Port = port }, Features = new() { StatsInterval = 0, MaxTodos = 2 } })), Todo.Metadata);
                await services.Init(observable, router); await services.Run(observable);
                using var http = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}"), Timeout = TimeSpan.FromSeconds(5) };
                if (!(await http.GetStringAsync("/")).Contains("<html")) throw new Exception("Native todo UI was not served");
                using var created = await http.PostAsJsonAsync("/api/todos", new { title = "native task", description = "keep" });
                if (created.StatusCode != HttpStatusCode.Created) throw new Exception("Native todo creation failed: " + await created.Content.ReadAsStringAsync());
                var item = (await created.Content.ReadFromJsonAsync<JsonObject>())!;
                var id = item["id"]!.GetValue<string>();
                using var changed = await http.PatchAsJsonAsync("/api/todos/" + id, new { id = Guid.NewGuid().ToString(), completed = true });
                changed.EnsureSuccessStatusCode();
                var updated = (await changed.Content.ReadFromJsonAsync<JsonObject>())!;
                if (updated["id"]!.GetValue<string>() != id || updated["description"]!.GetValue<string>() != "keep" || !updated["completed"]!.GetValue<bool>())
                    throw new Exception("HTTP route identity or optional field presence was lost");
                using var invalid = await http.PostAsJsonAsync("/api/todos", new { title = "" });
                if (invalid.StatusCode != HttpStatusCode.BadRequest) throw new Exception("Native todo accepted an invalid schema payload");
                using var oversized = await http.PostAsJsonAsync("/api/todos", new { title = new string('x', 70000) });
                if (oversized.StatusCode != HttpStatusCode.RequestEntityTooLarge) throw new Exception("Native HTTP body limit was not enforced");
                using var traversal = await http.GetAsync("/%2e%2e/bsb-config.json");
                if (traversal.IsSuccessStatusCode) throw new Exception("Static HTTP route exposed application files");
            }
            var stored = new TodoStore(Path.Combine(directory, "todos.json"), false, 2); await stored.Load();
            if (stored.List()["total"]!.GetValue<int>() != 1 || stored.Stats()["completed"]!.GetValue<int>() != 1) throw new Exception("Shutdown did not persist todo changes");
            var exports = SBPlugins.ExportAssembly(typeof(Todo).Assembly.Location, "BetterCorp.BSB.Examples", "1.0.0");
            if (exports.Count != 7 || exports.Any(x => x!["schema"]!["events"] is null)) throw new Exception("Native example static schema exports missing");
            Console.WriteLine("PASS: seven native example plugins, generated clients, aliased lifecycle, todo HTTP/validation/body limit and atomic persistence");
        }
        finally { Directory.Delete(directory, true); }
    }
}
