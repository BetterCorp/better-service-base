using AnyVali;
using BSB.Interfaces;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json.Nodes;

namespace BSB.Base;

public class NetworkLoggingConfig
{
    public string Host { get; init; } = "localhost";
    public int Port { get; init; } = 514;
    public string Protocol { get; init; } = "udp";
    public string Level { get; init; } = "info";
    public string[] Redact { get; init; } = [];
    public string? CaCertificatePath { get; init; }
    public string? ClientCertificatePath { get; init; }
    public string? ClientKeyPath { get; init; }
    public int FlushIntervalMs { get; init; } = 1000;
    public static Dictionary<string, Schema> Fields(int port, bool http = false) => new() {
        ["host"] = V.String().MinLength(1).Default("localhost"), ["port"] = V.Int32().Min(1).Max(65535).Default(port),
        ["protocol"] = V.Enum(http ? ["udp", "tcp", "tls", "http"] : ["udp", "tcp", "tls"]).Default("udp"),
        ["level"] = V.Enum(["trace", "debug", "info", "warn", "error", "fatal"]).Default("info"),
        ["redact"] = V.Array(V.String().MinLength(1)).Default(new List<object?>()),
        ["caCertificatePath"] = V.Optional(V.String().MinLength(1)), ["clientCertificatePath"] = V.Optional(V.String().MinLength(1)),
        ["clientKeyPath"] = V.Optional(V.String().MinLength(1)), ["flushIntervalMs"] = V.Int32().Min(100).Max(60000).Default(1000),
    };
}

public abstract class NetworkLogging<TConfig>(ServiceConstructorArgs<TConfig> args) : BufferedTelemetry<TConfig>(args) where TConfig : NetworkLoggingConfig
{
    private UdpClient? _udp;
    private TcpClient? _tcp;
    private Stream? _stream;
    private readonly List<X509Certificate2> _certificates = new();
    protected override int FlushIntervalMs => Config.FlushIntervalMs;
    protected override bool MetricsEnabled => false;
    protected override bool TracesEnabled => false;
    protected override void Write(JsonObject entry)
    {
        if (Severity(entry["level"]!.GetValue<string>()) < Severity(Config.Level)) return;
        Redact(entry, Config.Redact); Interpolate(entry); base.Write(entry);
    }
    protected async Task Send(ReadOnlyMemory<byte> bytes, CancellationToken token)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(5));
        try
        {
            if (Config.Protocol == "udp")
            {
                if (bytes.Length > 65507) throw new IOException("UDP log exceeds datagram limit");
                if (_udp is null)
                {
                    var addresses = await System.Net.Dns.GetHostAddressesAsync(Config.Host, timeout.Token);
                    var address = addresses.First();
                    _udp = new UdpClient(address.AddressFamily); _udp.Connect(address, Config.Port);
                }
                await _udp.SendAsync(bytes, timeout.Token);
                return;
            }
            if (_stream is null)
            {
                _tcp = new TcpClient();
                await _tcp.ConnectAsync(Config.Host, Config.Port, timeout.Token);
                _stream = _tcp.GetStream();
                if (Config.Protocol == "tls")
                {
                    var ssl = new SslStream(_stream, false);
                    _stream = ssl;
                    var options = new SslClientAuthenticationOptions { TargetHost = Config.Host };
                    if (Config.CaCertificatePath is not null)
                    {
                        var ca = X509Certificate2.CreateFromPem(await File.ReadAllTextAsync(Path.GetFullPath(Config.CaCertificatePath, Cwd), timeout.Token)); _certificates.Add(ca);
                        options.CertificateChainPolicy = new X509ChainPolicy {
                            TrustMode = X509ChainTrustMode.CustomRootTrust,
                            RevocationMode = options.CertificateRevocationCheckMode,
                            CustomTrustStore = { ca },
                        };
                    }
                    if (Config.ClientCertificatePath is not null)
                    {
                        var certificate = X509Certificate2.CreateFromPemFile(Path.GetFullPath(Config.ClientCertificatePath, Cwd),
                            Config.ClientKeyPath is null ? null : Path.GetFullPath(Config.ClientKeyPath, Cwd));
                        _certificates.Add(certificate); options.ClientCertificates = new() { certificate };
                    }
                    await ssl.AuthenticateAsClientAsync(options, timeout.Token);
                }
            }
            await _stream.WriteAsync(bytes, timeout.Token);
        }
        catch { Close(); throw; } // Next batch reconnects; a partial TCP write is never silently assumed delivered.
    }
    private void Close()
    {
        _stream?.Dispose(); _tcp?.Dispose(); _udp?.Dispose(); _stream = null; _tcp = null; _udp = null;
        foreach (var certificate in _certificates) certificate.Dispose(); _certificates.Clear();
    }
    public override async ValueTask DisposeAsync() { try { await base.DisposeAsync(); } finally { Close(); } }
    public static int SyslogSeverity(string level) => level switch { "fatal" => 2, "error" => 3, "warn" => 4, "info" => 6, _ => 7 };
}
