using BSB.Base;
using BSB.Interfaces;
using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;

namespace BSB.Plugins.EventsRabbitMQ;

public partial class Plugin
{
    private readonly ConcurrentDictionary<string, Receiver> _receivers = new();
    private readonly object _streamsLock = new();
    private readonly ConcurrentDictionary<string, (string Peer, Channel<JsonObject> Controls)> _senders = new();
    private sealed class Receiver(CancellationToken shutdown, int timeoutSeconds)
    {
        public readonly CancellationTokenSource Timeout = CancellationTokenSource.CreateLinkedTokenSource(shutdown);
        public readonly TaskCompletionSource<JsonObject> Start = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public readonly Channel<byte[]> Data = Channel.CreateBounded<byte[]>(8);
        public Task Task = Task.CompletedTask;
        public string? Sender;
        public int TimeoutSeconds = timeoutSeconds;
        public void Touch() => Timeout.CancelAfter(TimeSpan.FromSeconds(TimeoutSeconds));
    }

    private async Task InitStreams(IObservable obs)
    {
        await Consume(PrivateQueue("91se", _myId), 60000, true, obs, async (message, body) => {
            var correlation = message.BasicProperties.CorrelationId ?? "";
            if (correlation.StartsWith("s-", StringComparison.Ordinal) && _senders.TryGetValue(correlation[2..], out var sender))
            {
                if (message.BasicProperties.AppId != sender.Peer) throw new JsonException("Unexpected stream control sender");
                if (!sender.Controls.Writer.TryWrite(body)) throw new IOException("Stream control backlog exceeded");
            }
            else if (correlation.StartsWith("r-", StringComparison.Ordinal) && _receivers.TryGetValue(correlation[2..], out var receiver))
            {
                if (body["type"]?.GetValue<string>() == "start")
                {
                    if (body["myId"]?.GetValue<string>() is not { Length: > 0 } id || id != message.BasicProperties.AppId)
                        throw new JsonException("Invalid stream sender");
                    if (receiver.Sender is not null && receiver.Sender != id) throw new JsonException("Stream sender changed");
                    receiver.Sender = id;
                    receiver.Touch();
                    receiver.Start.TrySetResult(body);
                }
                else if (body["type"]?.GetValue<string>() == "timeout")
                {
                    if (receiver.Sender is null || message.BasicProperties.AppId != receiver.Sender) throw new JsonException("Unexpected stream timeout sender");
                    receiver.Timeout.Cancel();
                }
                else throw new JsonException("Invalid stream control message");
            }
            await Task.CompletedTask; // Late messages for expired registrations are acknowledged.
        }, ordered: true);
        await Consume(PrivateQueue("91sd", _myId), 60000, true, obs, async (message, body) => {
            var id = message.BasicProperties.CorrelationId ?? "";
            if (!_receivers.TryGetValue(id, out var receiver)) return;
            if (receiver.Sender is null || receiver.Sender != message.BasicProperties.AppId) throw new JsonException("Unexpected stream sender");
            receiver.Touch();
            var type = body["type"]?.GetValue<string>();
            if (type == "data")
            {
                var value = body["data"];
                var array = value is JsonArray list ? list : value is JsonObject buffer ? buffer["data"] as JsonArray : null;
                byte[] bytes;
                if (array is not null && array.Count <= 1048576) bytes = array.Select(x => x!.GetValue<byte>()).ToArray();
                else if (value is JsonValue scalar && scalar.TryGetValue<string>(out var text)
                    && System.Text.Encoding.UTF8.GetByteCount(text) <= 1048576)
                    bytes = System.Text.Encoding.UTF8.GetBytes(text);
                else throw new JsonException("Invalid stream byte buffer or chunk exceeds 1 MiB");
                await receiver.Data.Writer.WriteAsync(bytes, receiver.Timeout.Token);
            }
            else if (type == "event" && body["event"]?.GetValue<string>() == "end") receiver.Data.Writer.TryComplete();
            else if (type == "event" && body["event"]?.GetValue<string>() == "error")
                receiver.Data.Writer.TryComplete(new IOException("Remote stream failed"));
            else throw new JsonException("Invalid stream data message");
            await StreamControl(receiver.Sender, "s-" + id, new { type = "receipt", timeout = receiver.TimeoutSeconds * 1000, trace = obs.Trace });
        }, ordered: true);
    }

    private Task StreamControl(string peer, string correlation, object message) => Publish(PrivateQueue("91se", peer), message, 60000, correlation);

    public override Task<string> ReceiveStream(string pluginName, string eventName, IObservable obs, StreamHandler handler, int timeoutSeconds = 5)
    {
        if (timeoutSeconds is <= 0 or > 86400) throw new ArgumentOutOfRangeException(nameof(timeoutSeconds));
        string id;
        Receiver receiver;
        lock (_streamsLock)
        {
            ObjectDisposedException.ThrowIf(_disposed != 0, this);
            id = Guid.NewGuid().ToString();
            receiver = new Receiver(_shutdown.Token, timeoutSeconds);
            receiver.Timeout.CancelAfter(TimeSpan.FromSeconds(30));
            _receivers[id] = receiver;
            receiver.Task = RunReceiver();
        }
        return Task.FromResult($"{_myId}||{id}||{timeoutSeconds}");

        async Task RunReceiver()
        {
            IObservable? span = null;
            var called = false;
            try
            {
                var start = await receiver.Start.Task.WaitAsync(receiver.Timeout.Token);
                var trace = start["trace"]?.Deserialize<DTrace>();
                if (trace is DTrace parent && !parent.IsValid) throw new JsonException("Invalid stream trace");
                span = obs.StartSpan("stream.receive", new() { ["plugin"] = pluginName, ["event"] = eventName }, trace);
                await StreamControl(receiver.Sender!, "s-" + id, new { type = "receipt", timeout = timeoutSeconds * 1000, trace = span.Trace });
                using var stream = new RemoteStream(receiver.Data.Reader, receiver.Timeout.Token, async () =>
                    await StreamControl(receiver.Sender!, "s-" + id, new { type = "read", trace = span.Trace }));
                called = true;
                await handler(span, null, stream);
                if (!stream.Ended) throw new IOException("Stream receiver finished before consuming EOF");
                await StreamControl(receiver.Sender!, "s-" + id, new { type = "event", @event = "end", trace = span.Trace });
            }
            catch (Exception error)
            {
                if (!called) try { await handler(span ?? obs, error, null); } catch (Exception failure) { obs.Error(failure); }
                else (span ?? obs).Error(error);
                if (receiver.Sender is not null && !_shutdown.IsCancellationRequested)
                    try { await StreamControl(receiver.Sender, "s-" + id, new { type = "timeout", trace = obs.Trace }); } catch (Exception failure) { obs.Error(failure); }
            }
            finally { _receivers.TryRemove(id, out _); receiver.Timeout.Cancel(); receiver.Data.Writer.TryComplete(); span?.End(); }
        }
    }

    public override async Task SendStream(string pluginName, string eventName, IObservable obs, string streamId, Stream data)
    {
        var parts = streamId.Split("||", StringSplitOptions.None);
        if (parts.Length != 3 || parts[0].Length == 0 || parts[1].Length == 0 || !int.TryParse(parts[2], out var seconds) || seconds is <= 0 or > 86400)
            throw new ArgumentException("Invalid stream ID", nameof(streamId));
        var (peer, id) = (parts[0], parts[1]);
        var controls = Channel.CreateBounded<JsonObject>(128);
        if (!_senders.TryAdd(id, (peer, controls))) throw new InvalidOperationException("Stream is already being sent");
        var span = obs.StartSpan("stream.send", new() { ["plugin"] = pluginName, ["event"] = eventName });
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(_shutdown.Token);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        try
        {
            await StreamControl(peer, "r-" + id, new { type = "start", myId = _myId, trace = span.Trace });
            var buffer = new byte[65536];
            var ended = false;
            while (true)
            {
                var message = await controls.Reader.ReadAsync(timeout.Token);
                timeout.CancelAfter(TimeSpan.FromSeconds(seconds));
                switch (message["type"]?.GetValue<string>())
                {
                    case "receipt": break;
                    case "timeout": throw new IOException("Stream receiver timed out");
                    case "event":
                        if (message["event"]?.GetValue<string>() == "end" && ended) return;
                        throw new IOException("Stream receiver closed before completion");
                    case "read":
                        if (ended) break;
                        var count = await data.ReadAsync(buffer, timeout.Token);
                        if (count == 0)
                        {
                            ended = true;
                            await Publish(PrivateQueue("91sd", peer), new { type = "event", @event = "end", data = (object?)null, trace = span.Trace }, 60000, id, token: timeout.Token);
                        }
                        else await Publish(PrivateQueue("91sd", peer), new { type = "data", data = new { type = "Buffer", data = buffer.Take(count).Select(x => (int)x).ToArray() }, trace = span.Trace }, 60000, id, token: timeout.Token);
                        break;
                    default: throw new JsonException("Invalid stream sender control");
                }
            }
        }
        catch (Exception error)
        {
            span.Error(error);
            if (!_shutdown.IsCancellationRequested)
                try { await StreamControl(peer, "r-" + id, new { type = "timeout", trace = span.Trace }); } catch (Exception failure) { obs.Error(failure); }
            throw;
        }
        finally { _senders.TryRemove(id, out _); controls.Writer.TryComplete(); span.End(); }
    }

    public override Task<Stream> ReceiveStream(string pluginName, string eventName, IObservable obs) =>
        throw new NotSupportedException("Distributed streams require ReceiveStream(handler) and passing its returned ID to SendStream(streamId, stream)");
    public override Task SendStream(string pluginName, string eventName, IObservable obs, Stream data) =>
        throw new NotSupportedException("Distributed streams require the receiver's stream ID");
    private async Task DisposeStreams()
    {
        Task[] receiverTasks;
        lock (_streamsLock)
        {
            foreach (var receiver in _receivers.Values) { receiver.Timeout.Cancel(); receiver.Data.Writer.TryComplete(); }
            receiverTasks = _receivers.Values.Select(receiver => receiver.Task).ToArray();
        }
        foreach (var sender in _senders.Values) sender.Controls.Writer.TryComplete();
        try { await Task.WhenAll(receiverTasks).WaitAsync(TimeSpan.FromSeconds(5)); }
        catch (TimeoutException) { }
        _receivers.Clear(); _senders.Clear();
    }

    private sealed class RemoteStream(ChannelReader<byte[]> reader, CancellationToken shutdown, Func<Task> request) : Stream
    {
        private ReadOnlyMemory<byte> _current;
        public bool Ended { get; private set; }
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count) => ReadAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (buffer.IsEmpty || Ended) return 0;
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(shutdown, cancellationToken);
            while (_current.IsEmpty)
            {
                if (!reader.TryRead(out var bytes))
                {
                    if (reader.Completion.IsCompleted) { await reader.Completion; Ended = true; return 0; }
                    await request();
                    if (!await reader.WaitToReadAsync(timeout.Token)) { Ended = true; return 0; }
                    continue;
                }
                _current = bytes;
            }
            var count = Math.Min(buffer.Length, _current.Length);
            _current[..count].CopyTo(buffer); _current = _current[count..]; return count;
        }
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
