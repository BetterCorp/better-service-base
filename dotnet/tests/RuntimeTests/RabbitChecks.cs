using BSB.Base;
using BSB.Interfaces;
using RabbitMQ.Client;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;

static class RabbitChecks
{
    private static void Check(bool ok, string message) { if (!ok) throw new Exception(message); }
    private static async Task Until(Func<bool> predicate)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        while (!predicate()) await Task.Delay(10, timeout.Token);
    }
    public static async Task Run()
    {
        var broker = new Broker();
        var args = new PluginConstructorArgs { AppId = "wire-test", Cwd = ".", PluginName = "events-rabbitmq", Mode = DebugMode.Development,
            RawConfig = new { platformKey = "fixture" } };
        await using var rabbit = new TestRabbit(args, broker);
        var obs = new ObservableBackend("test", "rabbit", new(), new());
        await rabbit.Init(obs);
        Check(broker.Confirmed, "Publisher confirm tracking disabled");
        await rabbit.EmitEvent("worker", "late", obs, new { value = 1 });
        var declaration = broker.Queues["91eq-fixture-worker-late"];
        Check(declaration.Durable && !declaration.Exclusive && !declaration.AutoDelete &&
            (int)declaration.Arguments["x-message-ttl"]! == 3600000 && declaration.Arguments.ContainsKey("x-dead-letter-exchange"),
            "Producer did not retain work for a late listener");
        var published = broker.Messages.Last();
        Check(published.Body["args"]![0]!["value"]!.GetValue<int>() == 1 && published.Body["trace"]!["t"] is not null && published.Properties.Persistent,
            "Fire event wire format/persistence differs from Node");

        await rabbit.OnReturnableEvent("worker", "get", obs, (_, value) => Task.FromResult<object?>(value));
        broker.Confirmation = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var delivery = broker.Deliver("91ar-fixture-worker-get", new { trace = obs.Trace, args = new[] { new { value = "reply" } } },
            new BasicProperties { AppId = "node-peer", CorrelationId = "request", MessageId = "once" });
        await Until(() => broker.Messages.Any(x => x.Properties.CorrelationId == "request-resolve"));
        Check(!delivery.IsCompleted && broker.Acks.Count == 0, "RPC request acknowledged before reply confirmation");
        var reply = broker.Messages.Last();
        Check(reply.Queue == "91kr-fixture-node-peer" && reply.Body["result"]!["value"]!.GetValue<string>() == "reply", "RPC reply wire differs from Node");
        broker.Confirmation.SetResult();
        await delivery;
        Check(broker.Acks.Count == 1, "Confirmed RPC request was not acknowledged");

        broker.Confirmation = new(TaskCreationOptions.RunContinuationsAsynchronously);
        broker.Confirmation.SetException(new IOException("broker rejected publish"));
        await broker.Deliver("91ar-fixture-worker-get", new { trace = obs.Trace, args = new[] { 1 } },
            new BasicProperties { AppId = "node-peer", CorrelationId = "retry", MessageId = "retry" });
        Check(broker.Acks.Count == 1 && broker.Nacks.Last(), "Failed reply did not leave request for redelivery");
        broker.Confirmation = null;
        for (var i = 0; i < 10; i++)
            await broker.Deliver("91ar-fixture-worker-get", new { args = "invalid" }, new BasicProperties { MessageId = "poison", AppId = "node", CorrelationId = "bad" });
        Check(!broker.Nacks.Last() && broker.Nacks.TakeLast(10).Take(9).All(x => x), "Poison delivery was not dead-lettered at attempt 10");

        var request = rabbit.EmitEventAndReturn("node-worker", "get", obs, 12, 5);
        await Until(() => broker.Messages.Any(x => x.Queue == "91ar-fixture-node-worker-get"));
        var outbound = broker.Messages.Last(x => x.Queue == "91ar-fixture-node-worker-get");
        await broker.Deliver(broker.Consumers.Keys.Single(x => x.StartsWith("91kr-")), new { result = "node-result", trace = obs.Trace },
            new BasicProperties { CorrelationId = outbound.Properties.CorrelationId + "-resolve", MessageId = "reply" });
        Check((await request as JsonNode)?.GetValue<string>() == "node-result", "Node reply did not resolve native RPC");

        var received = new TaskCompletionSource<byte[]>(TaskCreationOptions.RunContinuationsAsynchronously);
        var streamId = await rabbit.ReceiveStream("worker", "download", obs, async (_, error, stream) => {
            if (error is not null) { received.TrySetException(error); return; }
            using var bytes = new MemoryStream(); await stream!.CopyToAsync(bytes); received.TrySetResult(bytes.ToArray());
        });
        var id = streamId.Split("||")[1];
        await broker.Deliver(broker.Consumers.Keys.Single(x => x.StartsWith("91se-")), new { type = "start", myId = "node-peer", trace = obs.Trace },
            new BasicProperties { AppId = "node-peer", CorrelationId = "r-" + id });
        await broker.Deliver(broker.Consumers.Keys.Single(x => x.StartsWith("91sd-")), new { type = "data", data = new { type = "Buffer", data = new[] { 0, 128, 255 } } },
            new BasicProperties { AppId = "node-peer", CorrelationId = id });
        await broker.Deliver(broker.Consumers.Keys.Single(x => x.StartsWith("91sd-")), new { type = "event", @event = "end" },
            new BasicProperties { AppId = "node-peer", CorrelationId = id });
        Check((await received.Task.WaitAsync(TimeSpan.FromSeconds(5))).SequenceEqual(new byte[] { 0, 128, 255 }), "Node byte stream was corrupted");
        await Until(() => broker.Messages.Any(x => x.Body["event"]?.GetValue<string>() == "end" && x.Properties.CorrelationId == "s-" + id));
        Console.WriteLine("PASS: RabbitMQ durable declarations, Node envelopes/RPC/stream, confirmation before ack and bounded poison retries");
    }

    sealed class TestRabbit(PluginConstructorArgs args, Broker broker) : BSB.Plugins.EventsRabbitMQ.Plugin(args)
    {
        protected override Task<IConnection> Connect(ConnectionFactory factory, AmqpTcpEndpoint[] endpoints, string name, CancellationToken token) =>
            Task.FromResult(broker.Connection());
    }
    public sealed record Declaration(bool Durable, bool Exclusive, bool AutoDelete, IDictionary<string, object?> Arguments);
    public sealed record Message(string Queue, JsonObject Body, BasicProperties Properties);
    public sealed class Broker
    {
        public readonly Dictionary<string, Declaration> Queues = new();
        public readonly Dictionary<string, IAsyncBasicConsumer> Consumers = new();
        public readonly List<Message> Messages = new();
        public readonly List<ulong> Acks = new();
        public readonly List<bool> Nacks = new();
        public TaskCompletionSource? Confirmation;
        public bool Confirmed;
        public IConnection Connection() => Proxy<IConnection>();
        private T Proxy<T>() where T : class
        {
            var proxy = DispatchProxy.Create<T, RabbitProxy>(); ((RabbitProxy)(object)proxy).Call = Call; return proxy;
        }
        public Task Deliver(string queue, object body, BasicProperties properties) => Consumers[queue].HandleBasicDeliverAsync(
            "test", 1, false, "", queue, properties, JsonSerializer.SerializeToUtf8Bytes(body), CancellationToken.None);
        private object? Call(MethodInfo method, object?[] a)
        {
            switch (method.Name)
            {
                case "CreateChannelAsync":
                    if (a[0] is CreateChannelOptions options) Confirmed |= options.PublisherConfirmationsEnabled && options.PublisherConfirmationTrackingEnabled;
                    return Task.FromResult(Proxy<IChannel>());
                case "QueueDeclareAsync":
                    Queues[(string)a[0]!] = new((bool)a[1]!, (bool)a[2]!, (bool)a[3]!, (IDictionary<string, object?>)a[4]!);
                    return Task.FromResult(new QueueDeclareOk((string)a[0]!, 0, 0));
                case "BasicConsumeAsync": Consumers[(string)a[0]!] = (IAsyncBasicConsumer)a[6]!; return Task.FromResult("test");
                case "BasicPublishAsync":
                    Messages.Add(new((string)a[1]!, JsonNode.Parse(((ReadOnlyMemory<byte>)a[4]!).Span)!.AsObject(), (BasicProperties)a[3]!));
                    return new ValueTask(Confirmation?.Task ?? Task.CompletedTask);
                case "BasicAckAsync": Acks.Add((ulong)a[0]!); return ValueTask.CompletedTask;
                case "BasicNackAsync": Nacks.Add((bool)a[2]!); return ValueTask.CompletedTask;
                case "get_IsOpen": return true;
            }
            if (method.ReturnType == typeof(Task)) return Task.CompletedTask;
            if (method.ReturnType == typeof(ValueTask)) return ValueTask.CompletedTask;
            if (method.ReturnType == typeof(void)) return null;
            throw new NotSupportedException(method.Name);
        }
    }
}
public class RabbitProxy : DispatchProxy
{
    public Func<MethodInfo, object?[], object?> Call = null!;
    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => Call(targetMethod!, args!);
}
