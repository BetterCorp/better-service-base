using AnyVali;
using BSB.Base;
using BSB.Interfaces;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace BSB.Plugins.ConfigVault;

public class Plugin(PluginConstructorArgs args) : JsonConfigProvider(args)
{
    public static Schema ConfigSchema => V.Object(new() {
        ["vaultUrl"] = V.String().MinLength(1), ["apiKeyId"] = V.String().MinLength(1),
        ["apiSecret"] = V.String().MinLength(1).Describe("Runtime secret", new() { Sensitive = true }),
        ["timeoutMs"] = V.Int32().Min(1000).Coerce(new() { From = "string" }).Default(5000),
        ["staleAllowedHours"] = V.Int32().Min(0).Coerce(new() { From = "string" }).Default(24),
        ["allowInsecureHttp"] = V.Bool().Coerce(new() { From = "string" }).Default(false),
        ["cacheDir"] = V.Optional(V.String().MinLength(1)),
        ["googleAudience"] = V.Optional(V.String().MinLength(1)),
        ["BSB_CONFIG_OVERRIDES"] = V.Optional(V.String().MaxLength(128 * 1024)),
    });
    protected VaultSettings Settings { get; private set; } = null!;
    protected virtual HttpMessageHandler CreateHandler() => new HttpClientHandler { AllowAutoRedirect = false };
    protected virtual Task AddHeaders(HttpRequestMessage request, bool refresh, CancellationToken token)
    {
        request.Headers.Add("x-vault-key-id", Settings.ApiKeyId);
        request.Headers.Add("x-vault-secret", Settings.ApiSecret);
        return Task.CompletedTask;
    }
    protected virtual bool RefreshAuth(int status) => false;

    public override async Task Init(IObservable obs)
    {
        Settings = JsonSerializer.Deserialize<VaultSettings>(JsonSerializer.Serialize(RawConfig), EventSchemaExport.JsonOptions)
            ?? throw new InvalidOperationException("Vault configuration missing");
        var origin = new Uri(Settings.VaultUrl, UriKind.Absolute);
        if (origin.Scheme != "https" && !(origin.Scheme == "http" && Settings.AllowInsecureHttp))
            throw new InvalidOperationException("Vault requires HTTPS unless allowInsecureHttp is enabled");
        if (!string.IsNullOrEmpty(origin.UserInfo)) throw new InvalidOperationException("Vault URL must not contain credentials");
        var url = new Uri(origin, "/runtime/config");
        JsonObject response;
        try
        {
            response = await Fetch(url);
            await ApplyResponse(response, obs);
            try { await WriteCache(url, response); }
            catch (IOException) { obs.Log.Warn("Vault loaded but encrypted cache could not be written"); }
            catch (UnauthorizedAccessException) { obs.Log.Warn("Vault loaded but encrypted cache could not be written"); }
        }
        catch (RetryableVaultException) when (Settings.StaleAllowedHours > 0)
        {
            response = await ReadCache(url);
            await ApplyResponse(response, obs);
            obs.Log.Warn("Vault unavailable; using encrypted cached version {version}", new LogMeta { ["version"] = response["version"]!.GetValue<int>() });
        }
    }

    private async Task ApplyResponse(JsonObject response, IObservable obs)
    {
        ValidateResponse(response);
        var profile = response["profile"]!.GetValue<string>();
        var config = response["config"]!.DeepClone().AsObject();
        ApplyOverrides(config, profile, Settings.BSB_CONFIG_OVERRIDES);
        LoadConfig(config, profile);
        await GetServicePlugins(obs); // Invalid or empty configurations never become a running host.
    }

    private async Task<JsonObject> Fetch(Uri url)
    {
        using var client = new HttpClient(CreateHandler()) { Timeout = Timeout.InfiniteTimeSpan, MaxResponseContentBufferSize = 4 * 1024 * 1024 };
        var timer = Stopwatch.StartNew();
        while (timer.ElapsedMilliseconds < 15000)
        {
            using var timeout = new CancellationTokenSource((int)Math.Min(Settings.TimeoutMs, 15000 - timer.ElapsedMilliseconds));
            try
            {
                for (var attempt = 0; attempt < 2; attempt++)
                {
                    using var request = new HttpRequestMessage(HttpMethod.Get, url);
                    await AddHeaders(request, attempt > 0, timeout.Token);
                    using var reply = await client.SendAsync(request, timeout.Token);
                    var status = (int)reply.StatusCode;
                    if (attempt == 0 && RefreshAuth(status)) continue;
                    if (status is 429 or 502 or 503 or 504) break;
                    if (!reply.IsSuccessStatusCode) throw new InvalidOperationException($"Vault refused configuration: HTTP {status}");
                    return JsonNode.Parse(await reply.Content.ReadAsStringAsync(timeout.Token)) as JsonObject
                        ?? throw new JsonException("Vault response must be an object");
                }
            }
            catch (HttpRequestException error) when (IsTransient(error)) { }
            catch (OperationCanceledException) when (timeout.IsCancellationRequested) { }
            var delay = Math.Min(250, 15000 - timer.ElapsedMilliseconds);
            if (delay > 0) await Task.Delay((int)delay);
        }
        throw new RetryableVaultException();
    }
    internal static bool IsTransient(HttpRequestException error)
    {
        for (Exception? cause = error; cause is not null; cause = cause.InnerException)
            if (cause is System.Security.Authentication.AuthenticationException) return false;
        return error.HttpRequestError is HttpRequestError.ConnectionError or HttpRequestError.NameResolutionError or HttpRequestError.ResponseEnded;
    }

    private static void ValidateResponse(JsonObject response)
    {
        if (response["language"]?.GetValue<string>() != "csharp") throw new JsonException("Vault deployment language must be csharp for this host");
        foreach (var key in new[] { "profile", "application", "group" })
            if (response[key]?.GetValue<string>() is not { Length: > 0 and <= 100 }) throw new JsonException($"Invalid Vault {key}");
        if (response["version"]?.GetValue<int>() is not > 0 || response["config"] is not JsonObject)
            throw new JsonException("Invalid Vault version or config");
    }

    private byte[] Binding(Uri url) => Encoding.UTF8.GetBytes($"{url.GetLeftPart(UriPartial.Authority)}\n{Settings.ApiKeyId}\ncsharp");
    private byte[] CacheKey(Uri url) => HKDF.DeriveKey(HashAlgorithmName.SHA256, Encoding.UTF8.GetBytes(Settings.ApiSecret), 32,
        Binding(url), Encoding.UTF8.GetBytes("BSB config-vault cache v1"));
    private string CacheFile(Uri url) => Path.Combine(Settings.CacheDir ?? Path.Combine(Cwd, ".bsb", "config-vault"), Convert.ToHexStringLower(SHA256.HashData(Binding(url))) + ".csharp.json");
    private async Task WriteCache(Uri url, JsonObject response)
    {
        var plaintext = Encoding.UTF8.GetBytes(new JsonObject { ["fetchedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["response"] = response.DeepClone() }.ToJsonString());
        var iv = RandomNumberGenerator.GetBytes(12); var tag = new byte[16]; var ciphertext = new byte[plaintext.Length];
        using var aes = new AesGcm(CacheKey(url), 16);
        aes.Encrypt(iv, plaintext, ciphertext, tag, Binding(url));
        CryptographicOperations.ZeroMemory(plaintext);
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new { iv = Convert.ToBase64String(iv), tag = Convert.ToBase64String(tag), data = Convert.ToBase64String(ciphertext) });
        var file = CacheFile(url); var directory = Path.GetDirectoryName(file)!;
        if (OperatingSystem.IsWindows()) Directory.CreateDirectory(directory);
        else Directory.CreateDirectory(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        var temporary = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            var options = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write };
            if (!OperatingSystem.IsWindows()) options.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
            await using (var stream = new FileStream(temporary, options)) await stream.WriteAsync(bytes);
            File.Move(temporary, file, overwrite: true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private async Task<JsonObject> ReadCache(Uri url)
    {
        var cache = JsonNode.Parse(await File.ReadAllTextAsync(CacheFile(url)))!.AsObject();
        var ciphertext = Convert.FromBase64String(cache["data"]!.GetValue<string>());
        var plaintext = new byte[ciphertext.Length];
        using var aes = new AesGcm(CacheKey(url), 16);
        aes.Decrypt(Convert.FromBase64String(cache["iv"]!.GetValue<string>()), ciphertext,
            Convert.FromBase64String(cache["tag"]!.GetValue<string>()), plaintext, Binding(url));
        try
        {
            var payload = JsonNode.Parse(plaintext)!.AsObject();
            var age = DateTimeOffset.UtcNow - DateTimeOffset.Parse(payload["fetchedAt"]!.GetValue<string>(), System.Globalization.CultureInfo.InvariantCulture);
            if (age.TotalHours < 0 || age.TotalHours > Settings.StaleAllowedHours) throw new InvalidOperationException("Vault cache expired");
            return payload["response"]!.AsObject();
        }
        finally { CryptographicOperations.ZeroMemory(plaintext); }
    }

    private sealed class RetryableVaultException : Exception;
}

public class VaultSettings
{
    public required string VaultUrl { get; init; }
    public required string ApiKeyId { get; init; }
    public required string ApiSecret { get; init; }
    public string? CacheDir { get; init; }
    public int TimeoutMs { get; init; } = 5000;
    public int StaleAllowedHours { get; init; } = 24;
    public bool AllowInsecureHttp { get; init; }
    public string? GoogleAudience { get; init; }
    public string? BSB_CONFIG_OVERRIDES { get; init; }
}
