using AnyVali;
using BSB.Base;
using BSB.Interfaces;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Hosting;
using System.Diagnostics;
using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace BSB.Examples;

public sealed class TodoConfig
{
    public StorageConfig Storage { get; init; } = new();
    public HttpConfig Http { get; init; } = new();
    public FeatureConfig Features { get; init; } = new();
    public sealed class StorageConfig { public string Path { get; init; } = ".temp/demo-todos.json"; public int AutoSaveInterval { get; init; } = 5000; public bool PrettyPrint { get; init; } = true; }
    public sealed class HttpConfig { public int Port { get; init; } = 3000; public string Host { get; init; } = "0.0.0.0"; public bool Cors { get; init; } = true; }
    public sealed class FeatureConfig { public int StatsInterval { get; init; } = 30; public int MaxTodos { get; init; } = 1000; }
}

public sealed class Todo : BSBService<TodoConfig>
{
    public new static BSBPluginMetadata Metadata => new() { Name = "service-demo-todo", Description = "Native todo CRUD, file storage and HTTP example", Tags = ["example", "todo", "http"] };
    public new static BSBEventSchemas EventSchemas => Contracts.Events("service-demo-todo");
    public static Schema ConfigSchema => BSBType.Import(Contracts.Read("service-demo-todo")["configSchema"]!.AsObject()).ToSchema();
    private readonly ServiceDemoTodoClient _self;
    private readonly TodoStore _store;
    private readonly CancellationTokenSource _shutdown = new();
    private Task[] _background = [];
    private WebApplication? _http;
    public Todo(ServiceConstructorArgs<TodoConfig> args) : base(args) {
        _self = new(Events, PluginName);
        _store = new(Path.GetFullPath(Config.Storage.Path, Cwd), Config.Storage.PrettyPrint, Config.Features.MaxTodos);
    }
    public override async Task Init(IObservable obs)
    {
        await _store.Load();
        await Events.OnReturnableEvent("todo.create", obs, async (span, input) => {
            var todo = _store.Create(Contracts.Input(input));
            await Events.EmitEvent("todo.created", span, todo); return todo;
        });
        await Events.OnReturnableEvent("todo.get", obs, (_, input) => Task.FromResult<object?>(_store.Get(Contracts.Input(input)["id"]!.GetValue<string>())));
        await Events.OnReturnableEvent("todo.list", obs, (_, _) => Task.FromResult<object?>(_store.List()));
        await Events.OnReturnableEvent("todo.update", obs, async (span, input) => {
            var todo = _store.Update(Contracts.Input(input));
            await Events.EmitEvent("todo.updated", span, todo); return todo;
        });
        await Events.OnReturnableEvent("todo.delete", obs, async (span, input) => {
            var value = Contracts.Input(input); var result = _store.Delete(value["id"]!.GetValue<string>());
            await Events.EmitEvent("todo.deleted", span, value); return result;
        });
    }
    public override async Task Run(IObservable obs)
    {
        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions {
            Args = [], ContentRootPath = Cwd, ApplicationName = typeof(WebApplication).Assembly.FullName });
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(server => {
            server.Limits.MaxRequestBodySize = 65536;
            server.Listen(Config.Http.Host == "localhost" ? IPAddress.Loopback : IPAddress.Parse(Config.Http.Host), Config.Http.Port);
        });
        _http = builder.Build();
        _http.Run(HandleHttp);
        await _http.StartAsync();
        _background = [Repeat(Config.Storage.AutoSaveInterval, _ => _store.Save()),
            Config.Features.StatsInterval == 0 ? Task.CompletedTask : Repeat(Config.Features.StatsInterval * 1000L, span => Events.EmitBroadcast("todo.stats", span, _store.Stats()))];
        obs.Log.Info("Todo HTTP server started on port {port}", new() { ["port"] = Config.Http.Port });
    }
    private async Task Repeat(long milliseconds, Func<IObservable, Task> action)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(milliseconds));
        try {
            while (await timer.WaitForNextTickAsync(_shutdown.Token)) {
                var span = CreateTrace("todo.background");
                try { await action(span); } catch (Exception error) { span.Error(error); } finally { span.End(); }
            }
        } catch (OperationCanceledException) when (_shutdown.IsCancellationRequested) { }
    }
    private static T Input<T>(JsonObject value) => value.Deserialize<T>(EventSchemaExport.JsonOptions)!;
    private async Task HandleHttp(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "/"; var method = context.Request.Method;
        var span = CreateTrace("http.request", new() { ["http.method"] = method });
        var watch = Stopwatch.StartNew();
        try {
            if (Config.Http.Cors) {
                context.Response.Headers.AccessControlAllowOrigin = "*";
                context.Response.Headers.AccessControlAllowMethods = "GET,POST,PATCH,DELETE,OPTIONS";
                context.Response.Headers.AccessControlAllowHeaders = "Content-Type";
                if (method == "OPTIONS") { context.Response.StatusCode = 204; return; }
            }
            var asset = path switch { "/" or "/index.html" => ("index.html", "text/html"), "/app.js" => ("app.js", "text/javascript"), "/style.css" => ("style.css", "text/css"), _ => default };
            if (method == "GET" && asset.Item1 is not null) {
                using var stream = typeof(Todo).Assembly.GetManifestResourceStream("Static." + asset.Item1)!;
                context.Response.ContentType = asset.Item2; await stream.CopyToAsync(context.Response.Body, context.RequestAborted); return;
            }
            JsonObject body = new();
            if (method is "POST" or "PATCH") body = (await JsonNode.ParseAsync(context.Request.Body, cancellationToken: context.RequestAborted)) as JsonObject ?? throw new JsonException("Expected an object");
            object? result;
            if (path == "/api/todos" && method == "GET") result = await _self.TodoList(span, new());
            else if (path == "/api/todos" && method == "POST") { result = await _self.TodoCreate(span, Input<ServiceDemoTodoClientTodoCreateInput>(body)); context.Response.StatusCode = 201; }
            else if (path.StartsWith("/api/todos/", StringComparison.Ordinal) && Guid.TryParse(path[11..], out var id)) {
                body["id"] = id.ToString(); // The route owns identity; a JSON body cannot replace it.
                result = method switch {
                    "GET" => await _self.TodoGet(span, new() { Id = id.ToString() }),
                    "PATCH" => await _self.TodoUpdate(span, Input<ServiceDemoTodoClientTodoUpdateInput>(body)),
                    "DELETE" => await _self.TodoDelete(span, new() { Id = id.ToString() }),
                    _ => throw new KeyNotFoundException("Route not found") };
            } else { context.Response.StatusCode = 404; result = new { error = "Not found" }; }
            await context.Response.WriteAsJsonAsync(result, EventSchemaExport.JsonOptions, context.RequestAborted);
        }
        catch (Exception error) when (!context.RequestAborted.IsCancellationRequested) {
            span.Error(error);
            context.Response.StatusCode = error switch { BadHttpRequestException http => http.StatusCode, KeyNotFoundException => 404, JsonException or ValidationError or InvalidOperationException => 400, _ => 500 };
            await context.Response.WriteAsJsonAsync(new { error = context.Response.StatusCode == 500 ? "Internal server error" : "Invalid request or missing todo" }, context.RequestAborted);
        }
        finally {
            span.Metrics.Counter("http.requests", "HTTP requests", "1").Increment(1, new() { ["method"] = method, ["status"] = context.Response.StatusCode.ToString() });
            span.Metrics.Histogram("http.duration", "HTTP request duration", "ms").Record(watch.Elapsed.TotalMilliseconds);
            span.End(new() { ["http.status_code"] = context.Response.StatusCode });
        }
    }
    public override async ValueTask DisposeAsync()
    {
        await _shutdown.CancelAsync();
        try {
            if (_http is not null) { await _http.StopAsync(TimeSpan.FromSeconds(10)); await _http.DisposeAsync(); }
            await Task.WhenAll(_background);
        } finally { await _store.Save(); _shutdown.Dispose(); }
    }
}
