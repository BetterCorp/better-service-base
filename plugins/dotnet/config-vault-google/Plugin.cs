using AnyVali;
using BSB.Interfaces;
using Google.Apis.Auth.OAuth2;
using System.Text.Json.Nodes;

namespace BSB.Plugins.ConfigVaultGoogle;

public class Plugin(PluginConstructorArgs args) : ConfigVault.Plugin(args)
{
    private OidcToken? _idToken;
    public new static Schema ConfigSchema
    {
        get
        {
            var document = JsonNode.Parse(V.Export(ConfigVault.Plugin.ConfigSchema).ToJson())!;
            document["root"]!["properties"]!["googleAudience"] = new JsonObject { ["kind"] = "string", ["minLength"] = 1 };
            document["root"]!["required"]!.AsArray().Add("googleAudience");
            return V.Import(AnyValiDocument.FromJson(document.ToJsonString()));
        }
    }
    protected override bool RefreshAuth(int status) => status is 401 or 403;
    protected override async Task AddHeaders(HttpRequestMessage request, bool refresh, CancellationToken token)
    {
        await base.AddHeaders(request, refresh, token);
        try
        {
            request.Headers.Add("X-Serverless-Authorization", "Bearer " + await GoogleToken(refresh, token));
        }
        catch (Exception error) { throw new InvalidOperationException("Google ID token acquisition failed", error); }
    }
    protected virtual async Task<string> GoogleToken(bool refresh, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(Settings.GoogleAudience)) throw new InvalidOperationException("googleAudience is required");
        if (refresh) _idToken = null;
        _idToken ??= await (await GoogleCredential.GetApplicationDefaultAsync(cancellationToken))
            .GetOidcTokenAsync(OidcTokenOptions.FromTargetAudience(Settings.GoogleAudience), cancellationToken);
        return await _idToken.GetAccessTokenAsync(cancellationToken);
    }
}
