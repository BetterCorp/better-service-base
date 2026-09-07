using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace BSB.Tooling;

internal static class HostedClient
{
    private const int MaxResponseBytes = 4 * 1024 * 1024;

    public static async Task<string> Install(string cwd, string value, string? plugin = null, string? sourceLanguage = null, string? version = null, bool allowInsecure = false)
    {
        var origin = Origin(value, allowInsecure);
        var discoveryUri = new Uri(origin + "/.well-known/bsb");
        var discovery = await GetJson(discoveryUri);
        if (discovery["bsb"]?.GetValue<int>() != 1) throw new JsonException("Hosted discovery must declare bsb: 1");
        var plugins = discovery["plugins"]?.AsArray() ?? throw new JsonException("Hosted discovery must contain plugins");
        if (plugins.Count is 0 or > 128) throw new JsonException("Hosted discovery must contain 1 to 128 plugins");
        (string Org, string Name)? requestedPlugin = plugin is null ? null : RegistryClient.ParsePluginId(plugin);
        if (sourceLanguage is not null) sourceLanguage = RegistryClient.Language(sourceLanguage);
        if (version is not null && !RegistryClient.IsExactVersion(version)) throw new ArgumentException("Version must be an exact semantic version");

        var identities = new HashSet<string>(StringComparer.Ordinal);
        var entries = new List<(JsonObject Entry, string Org, string Name, string Language, string Version)>();
        foreach (var node in plugins)
        {
            var entry = node?.AsObject() ?? throw new JsonException("Hosted plugin entry must be an object");
            var id = entry["id"]?.GetValue<string>() ?? throw new JsonException("Hosted plugin entry lacks id");
            var (org, name) = RegistryClient.ParsePluginId(id);
            var language = RegistryClient.Language(entry["language"]?.GetValue<string>() ?? throw new JsonException("Hosted plugin entry lacks language"));
            var entryVersion = entry["version"]?.GetValue<string>() ?? throw new JsonException("Hosted plugin entry lacks version");
            if (!RegistryClient.IsExactVersion(entryVersion)) throw new JsonException("Hosted plugin entry has an invalid version");
            if (entry["schema"] is not JsonObject && (entry["schema"] is not JsonValue schemaValue || !schemaValue.TryGetValue<string>(out _)))
                throw new JsonException("Hosted plugin entry schema must be an object or URL string");
            if (!identities.Add($"{org}\n{name}\n{language}\n{entryVersion}")) throw new JsonException("Hosted discovery contains duplicate plugin identities");
            entries.Add((entry, org, name, language, entryVersion));
        }
        var matches = entries.Where(entry => (requestedPlugin is null || (entry.Org, entry.Name) == requestedPlugin.Value) &&
            (sourceLanguage is null || entry.Language == sourceLanguage) && (version is null || entry.Version == version)).ToArray();
        if (matches.Length != 1) throw new InvalidOperationException(matches.Length == 0 ? "No hosted plugin matches the requested selection" : "Hosted plugin selection is ambiguous; specify --plugin, --source-language or --version");

        var selected = matches[0];
        JsonObject schema;
        if (selected.Entry["schema"] is JsonObject inline) schema = inline.DeepClone().AsObject();
        else if (selected.Entry["schema"]?.GetValue<string>() is string link)
        {
            var schemaUri = new Uri(discoveryUri, link);
            if (!SameOrigin(discoveryUri, schemaUri) || !string.IsNullOrEmpty(schemaUri.UserInfo) || !string.IsNullOrEmpty(schemaUri.Fragment))
                throw new ArgumentException("Hosted schema link must remain on the discovery origin without credentials or fragments");
            schema = await GetJson(schemaUri);
        }
        else throw new JsonException("Hosted plugin entry lacks a schema");
        if (schema["events"] is not JsonObject) throw new JsonException("Hosted plugin schema must contain events");
        var wireTarget = schema["pluginId"]?.GetValue<string>() ?? schema["pluginName"]?.GetValue<string>() ?? selected.Name;
        var (wireOrg, wireName) = RegistryClient.ParsePluginId(wireTarget);
        if (wireOrg != "_" || wireName != wireTarget) throw new JsonException("Hosted plugin wire target must be an unqualified plugin identifier");
        if (schema["version"] is JsonNode schemaVersion && schemaVersion.GetValue<string>() != selected.Version)
            throw new JsonException("Hosted plugin schema version does not match its discovery entry");
        schema["version"] ??= selected.Version;
        schema["pluginId"] = wireTarget;
        schema["pluginName"] ??= wireTarget;
        schema["source"] = new JsonObject { ["url"] = origin, ["org"] = selected.Org, ["name"] = selected.Name, ["language"] = selected.Language, ["version"] = selected.Version };
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(origin))).ToLowerInvariant()[..16];
        return await RegistryClient.SaveClient(cwd, schema, $"hosted~{hash}~{selected.Org}~{selected.Name}~{selected.Language}");
    }

    private static string Origin(string value, bool allowInsecure)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme is not ("https" or "http") ||
            (uri.Scheme == "http" && !allowInsecure) || !string.IsNullOrEmpty(uri.UserInfo) || uri.AbsolutePath != "/" ||
            !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment))
            throw new ArgumentException("Hosted client installation requires a credential-free HTTPS origin; use --allow-insecure only for local HTTP");
        var host = uri.IdnHost.ToLowerInvariant();
        if (host.Contains(':')) host = "[" + host + "]";
        var defaultPort = uri.Scheme == "https" ? 443 : 80;
        return uri.Scheme + "://" + host + (uri.Port == defaultPort ? "" : ":" + uri.Port);
    }

    private static bool SameOrigin(Uri left, Uri right) => left.Scheme == right.Scheme && left.Port == right.Port &&
        string.Equals(left.IdnHost, right.IdnHost, StringComparison.OrdinalIgnoreCase);

    private static async Task<JsonObject> GetJson(Uri uri)
    {
        using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(10), MaxResponseContentBufferSize = MaxResponseBytes };
        using var response = await http.GetAsync(uri);
        if ((int)response.StatusCode is >= 300 and < 400) throw new HttpRequestException("Hosted discovery redirects are not allowed", null, response.StatusCode);
        if (!response.IsSuccessStatusCode) throw new HttpRequestException($"Hosted discovery returned HTTP {(int)response.StatusCode}", null, response.StatusCode);
        if (response.Content.Headers.ContentLength > MaxResponseBytes) throw new HttpRequestException("Hosted discovery response exceeds 4 MiB");
        return JsonNode.Parse(await response.Content.ReadAsStringAsync())?.AsObject() ?? throw new JsonException("Hosted discovery response must be a JSON object");
    }
}
