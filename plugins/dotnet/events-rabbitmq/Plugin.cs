using AnyVali;
using BSB.Base;
using BSB.Interfaces;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Security.Cryptography;

namespace BSB.Plugins.EventsRabbitMQ;

/// <summary>Native AMQP 0-9-1 transport using the existing BSB 9 Node wire protocol.</summary>
public partial class Plugin : BSBEvents
{
    public static Schema ConfigSchema => V.Object(new() {
        ["platformKey"] = V.Nullable(V.String()).Default(null),
        ["fatalOnDisconnect"] = V.Bool().Default(true),
        ["prefetch"] = V.Int32().Min(1).Max(65535).Default(10),
        ["endpoints"] = V.Array(V.String().MinLength(1)).MinItems(1).Default(new List<object?> { "amqp://localhost" }),
        ["credentials"] = V.Object(new() {
            ["username"] = V.String().Default("guest"),
            ["password"] = V.String().Default("guest").Describe("RabbitMQ password", new DescribeOptions { Sensitive = true }),
        }).Default(new Dictionary<string, object?> { ["username"] = "guest", ["password"] = "guest" }),
        ["uniqueId"] = V.Nullable(V.String()).Default(Environment.MachineName),
    });

    private readonly JsonObject _settings;
    private readonly CancellationTokenSource _shutdown = new();
    private readonly TaskCompletionSource _completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly ConcurrentDictionary<string, TaskCompletionSource<object?>> _pending = new();
    private readonly ConcurrentBag<IChannel> _channels = new();
    private readonly SemaphoreSlim _publishLock = new(1, 1);
    private IConnection? _receiveConnection, _publishConnection;
    private IChannel _publisher = null!;
    private int _disposed;
    private readonly string _myId;
    public override Task Completion => _completion.Task;
    private string Platform(string name) => _settings["platformKey"] is JsonNode key ? $"{name}-{key.GetValue<string>()}" : name;
    private string Queue(string kind, string plugin, string name) => QueueName($"{Platform(kind)}-{plugin}-{name}");
    private string PrivateQueue(string kind, string id) => QueueName($"{Platform(kind)}-{id}");
    private string DeadLetter => Platform("better.service9.deadletter");
    private string BroadcastExchange => Platform("better.service9.broadcast.direct");
    private static string QueueName(string name) => System.Text.Encoding.UTF8.GetByteCount(name) <= 255 && !name.Contains('\0')
        ? name : throw new ArgumentException("AMQP queue name exceeds 255 bytes or contains NUL");

    public Plugin(PluginConstructorArgs args) : base(args)
    {
        _settings = JsonSerializer.SerializeToNode(ConfigSchema.Parse(BSBType.ToWireValue(args.RawConfig ?? new { })))!.AsObject();
        _myId = $"{_settings["uniqueId"]?.GetValue<string>() ?? Environment.MachineName}-{Guid.NewGuid()}";
        QueueName(PrivateQueue("91kr", _myId));
    }

    public override async Task Init(IObservable obs)
    {
        var uris = _settings["endpoints"]!.AsArray().Select(x => new Uri(x!.GetValue<string>(), UriKind.Absolute)).ToArray();
        if (uris.Any(uri => uri.Scheme is not ("amqp" or "amqps") || uri.AbsolutePath != uris[0].AbsolutePath))
            throw new ArgumentException("RabbitMQ endpoints must use amqp/amqps and the same virtual host");
        var factory = new ConnectionFactory {
            Uri = uris[0], UserName = _settings["credentials"]!["username"]!.GetValue<string>(),
            Password = _settings["credentials"]!["password"]!.GetValue<string>(),
            AutomaticRecoveryEnabled = !_settings["fatalOnDisconnect"]!.GetValue<bool>(), TopologyRecoveryEnabled = true,
            RequestedConnectionTimeout = TimeSpan.FromSeconds(15), RequestedHeartbeat = TimeSpan.FromSeconds(30),
        };
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(_shutdown.Token);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        var endpoints = uris.Select(uri => new AmqpTcpEndpoint(uri)).ToArray();
        _publishConnection = await Connect(factory, endpoints, $"BSB {_myId} publish", timeout.Token);
        _receiveConnection = await Connect(factory, endpoints, $"BSB {_myId} receive", timeout.Token);
        foreach (var connection in new[] { _publishConnection, _receiveConnection })
            connection.ConnectionShutdownAsync += (_, _) => {
                if (_disposed == 0 && _settings["fatalOnDisconnect"]!.GetValue<bool>())
                    _completion.TrySetException(new IOException("RabbitMQ connection closed"));
                return Task.CompletedTask;
            };
        _publisher = await _publishConnection.CreateChannelAsync(new CreateChannelOptions(true, true), timeout.Token);
        await _publisher.ExchangeDeclareAsync(DeadLetter, "topic", durable: true, cancellationToken: timeout.Token);
        await _publisher.QueueDeclareAsync(DeadLetter, durable: true, exclusive: false, autoDelete: false,
            arguments: new Dictionary<string, object?> { ["x-message-ttl"] = 604800000 }, cancellationToken: timeout.Token);
        await _publisher.QueueBindAsync(DeadLetter, DeadLetter, "#", cancellationToken: timeout.Token);
        await _publisher.ExchangeDeclareAsync(BroadcastExchange, "direct", durable: false, cancellationToken: timeout.Token);
        await Consume(PrivateQueue("91kr", _myId), 60000, true, obs, async (message, body) => {
            var correlation = message.BasicProperties.CorrelationId ?? throw new JsonException("Missing RPC reply correlation");
            var reject = correlation.EndsWith("-reject", StringComparison.Ordinal);
            var suffix = reject ? "-reject" : "-resolve";
            if (!correlation.EndsWith(suffix, StringComparison.Ordinal)) throw new JsonException("Invalid RPC reply correlation");
            if (_pending.TryGetValue(correlation[..^suffix.Length], out var pending))
            {
                if (reject) pending.TrySetException(new BSBError(body["error"]?.GetValue<string>() ?? "Remote handler failed", obs.Trace, PluginName));
                else pending.TrySetResult(body["result"]?.DeepClone());
            }
            await Task.CompletedTask;
        });
        await InitStreams(obs);
        obs.Log.Info("RabbitMQ connected; queues and reply consumer ready");
    }

    protected virtual Task<IConnection> Connect(ConnectionFactory factory, AmqpTcpEndpoint[] endpoints, string name, CancellationToken token) =>
        factory.CreateConnectionAsync(endpoints, name, token);

    private Task<QueueDeclareOk> Declare(IChannel channel, string queue, int ttl, bool exclusive, CancellationToken token) =>
        channel.QueueDeclareAsync(queue, durable: !exclusive, exclusive: exclusive, autoDelete: exclusive,
            arguments: new Dictionary<string, object?> { ["x-message-ttl"] = ttl, ["x-expires"] = ttl, ["x-dead-letter-exchange"] = DeadLetter },
            cancellationToken: token);

    private async Task Consume(string queue, int ttl, bool exclusive, IObservable obs,
        Func<BasicDeliverEventArgs, JsonObject, Task> handle, string? routingKey = null, bool ordered = false)
    {
        var channel = await _receiveConnection!.CreateChannelAsync(new CreateChannelOptions(false, false,
            consumerDispatchConcurrency: ordered ? (ushort)1 : (ushort)_settings["prefetch"]!.GetValue<int>()), _shutdown.Token);
        _channels.Add(channel);
        await channel.BasicQosAsync(0, (ushort)_settings["prefetch"]!.GetValue<int>(), false, _shutdown.Token);
        await Declare(channel, queue, ttl, exclusive, _shutdown.Token);
        if (routingKey is not null) await channel.QueueBindAsync(queue, BroadcastExchange, routingKey, cancellationToken: _shutdown.Token);
        var failures = new ConcurrentDictionary<string, int>();
        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += async (sender, message) => {
            var key = message.BasicProperties.MessageId ?? Convert.ToHexString(SHA256.HashData(message.Body.Span));
            try
            {
                if (message.Body.Length > 16 * 1024 * 1024) throw new JsonException("AMQP payload exceeds 16 MiB");
                var body = JsonNode.Parse(message.Body.Span) as JsonObject ?? throw new JsonException("AMQP body must be an object");
                await handle(message, body);
                // RPC handlers return only after the reply publish is confirmed.
                await channel.BasicAckAsync(message.DeliveryTag, false, _shutdown.Token);
                failures.TryRemove(key, out _);
            }
            catch (Exception error)
            {
                var attempt = failures.AddOrUpdate(key, 1, (_, previous) => previous + 1);
                if (attempt >= 10) failures.TryRemove(key, out _);
                obs.Log.Error(error, "RabbitMQ delivery failed", new LogMeta { ["attempt"] = attempt, ["queue"] = queue });
                try { await channel.BasicNackAsync(message.DeliveryTag, false, attempt < 10, _shutdown.Token); }
                catch (Exception) when (!channel.IsOpen || _shutdown.IsCancellationRequested) { failures.TryRemove(key, out _); }
            }
        };
        await channel.BasicConsumeAsync(queue, false, consumer, _shutdown.Token);
    }

    private async Task Publish(string queue, object body, int ttl, string? correlation = null, string exchange = "",
        int? declareTtl = null, bool mandatory = true, CancellationToken token = default)
    {
        ObjectDisposedException.ThrowIf(_disposed != 0, this);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(_shutdown.Token, token);
        timeout.CancelAfter(TimeSpan.FromSeconds(5));
        var bytes = JsonSerializer.SerializeToUtf8Bytes(body);
        if (bytes.Length > 16 * 1024 * 1024) throw new ArgumentException("AMQP payload exceeds 16 MiB");
        // ponytail: one confirmed publish at a time; use a channel pool if broker RTT limits throughput.
        await _publishLock.WaitAsync(timeout.Token);
        try
        {
            if (declareTtl is int lifetime) await Declare(_publisher, queue, lifetime, false, timeout.Token);
            await _publisher.BasicPublishAsync(exchange, queue, mandatory, new BasicProperties {
                Persistent = true, ContentType = "application/json", MessageId = Guid.NewGuid().ToString(), AppId = _myId,
                CorrelationId = correlation, Expiration = ttl.ToString(System.Globalization.CultureInfo.InvariantCulture),
                Timestamp = new AmqpTimestamp(DateTimeOffset.UtcNow.ToUnixTimeSeconds()),
            }, bytes, timeout.Token);
        }
        finally { _publishLock.Release(); }
    }

    private static (IObservable Span, object? Data) Incoming(IObservable obs, JsonObject body, string plugin, string name)
    {
        if (body["args"] is not null && body["args"] is not JsonArray) throw new JsonException("AMQP args must be an array");
        var args = body["args"] as JsonArray;
        if (args?.Count > 1) throw new JsonException("Typed BSB events accept one payload");
        DTrace? parent = body["trace"]?.Deserialize<DTrace>();
        if (parent is DTrace trace && !trace.IsValid) throw new JsonException("Invalid AMQP trace context");
        return (obs.StartSpan("events.receive", new() { ["plugin"] = plugin, ["event"] = name }, parent), args?.FirstOrDefault()?.DeepClone());
    }

    public override Task EmitEvent(string pluginName, string eventName, IObservable obs, object? data) =>
        Publish(Queue("91eq", pluginName, eventName), new { trace = obs.Trace, args = new[] { data } }, 3600000, declareTtl: 3600000);
    public override Task OnEvent(string pluginName, string eventName, IObservable obs, BSB.Base.EventHandler handler) =>
        Listen(pluginName, eventName, obs, handler, false);
    public override Task OnBroadcast(string pluginName, string eventName, IObservable obs, BroadcastHandler handler) =>
        Listen(pluginName, eventName, obs, (trace, data) => handler(trace, data), true);
    private Task Listen(string plugin, string name, IObservable obs, BSB.Base.EventHandler handler, bool broadcast)
    {
        var route = Queue(broadcast ? "91eb" : "91eq", plugin, name);
        return Consume(broadcast ? QueueName($"{route}-{Guid.NewGuid()}") : route, 3600000, broadcast, obs, async (_, body) => {
            var (span, data) = Incoming(obs, body, plugin, name);
            try { await handler(span, data); }
            catch (Exception error) { span.Error(error); throw; }
            finally { span.End(); }
        }, broadcast ? route : null);
    }
    public override Task EmitBroadcast(string pluginName, string eventName, IObservable obs, object? data) =>
        Publish(Queue("91eb", pluginName, eventName), new { trace = obs.Trace, args = new[] { data } }, 3600000,
            exchange: BroadcastExchange, mandatory: false);

    public override Task OnReturnableEvent(string pluginName, string eventName, IObservable obs, ReturnableEventHandler handler) =>
        Consume(Queue("91ar", pluginName, eventName), 60000, false, obs, async (message, body) => {
            var appId = message.BasicProperties.AppId;
            var correlation = message.BasicProperties.CorrelationId;
            if (string.IsNullOrEmpty(appId) || string.IsNullOrEmpty(correlation)) throw new JsonException("RPC requires appId and correlationId");
            var (span, data) = Incoming(obs, body, pluginName, eventName);
            try
            {
                object reply;
                string outcome;
                try { reply = new { trace = span.Trace, result = await handler(span, data) }; outcome = "resolve"; }
                catch (Exception error) { span.Error(error); reply = new { trace = span.Trace, error = error.Message }; outcome = "reject"; }
                await Publish(PrivateQueue("91kr", appId), reply, 5000, $"{correlation}-{outcome}");
            }
            finally { span.End(); }
        });

    public override async Task<object?> EmitEventAndReturn(string pluginName, string eventName, IObservable obs, object? data, double timeoutSeconds = 30)
    {
        var duration = TimeoutDuration(timeoutSeconds);
        var ttl = checked((int)Math.Ceiling(timeoutSeconds * 1000 + 5000));
        var correlation = Guid.NewGuid().ToString();
        var pending = new TaskCompletionSource<object?>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[correlation] = pending;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(_shutdown.Token);
        timeout.CancelAfter(duration);
        var span = obs.StartSpan("events.request", new() { ["plugin"] = pluginName, ["event"] = eventName });
        try
        {
            await Publish(Queue("91ar", pluginName, eventName), new { trace = span.Trace, args = new[] { data } }, ttl, correlation, declareTtl: 60000, token: timeout.Token);
            return await pending.Task.WaitAsync(timeout.Token);
        }
        catch (Exception error) { span.Error(error); throw; }
        finally { _pending.TryRemove(correlation, out _); span.End(); }
    }

    public override async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
        _shutdown.Cancel();
        _completion.TrySetResult();
        foreach (var pending in _pending.Values) pending.TrySetCanceled();
        _pending.Clear();
        DisposeStreams();
        List<Exception> errors = new();
        foreach (var channel in _channels) try { await channel.DisposeAsync(); } catch (Exception error) { errors.Add(error); }
        if (_publisher is not null) try { await _publisher.DisposeAsync(); } catch (Exception error) { errors.Add(error); }
        foreach (var connection in new[] { _receiveConnection, _publishConnection })
            if (connection is not null) try { await connection.DisposeAsync(); } catch (Exception error) { errors.Add(error); }
        if (errors.Count > 0) throw new AggregateException(errors);
    }
}
