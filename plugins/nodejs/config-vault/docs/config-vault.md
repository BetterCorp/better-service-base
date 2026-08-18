# config-vault

`config-vault` is a BSB config plugin that loads runtime config from Vault.

Only one BSB config plugin can be active. If `BSB_CONFIG_PLUGIN=config-vault`, Vault owns the full runtime config source.

## Runtime Behavior

`config-vault` is activated as the BSB config source with environment variables, not as a normal plugin config block in `sec-config.yaml`.

```bash
BSB_CONFIG_PLUGIN=config-vault
BSB_CONFIG_PLUGIN_PACKAGE=@bsb/config-vault
vaultUrl=https://vault.example.com
apiKeyId=vk_xxx
apiSecret=vs_xxx
timeoutMs=5000
staleAllowedHours=24
```

The lower camel case keys are intentional. BSB reads config plugin env vars from the plugin schema, so these are the exact schema keys. `staleAllowedHours` defaults to 24 hours; set it to `0` to disable cached startup.

The API key is bound in Vault to:

- application,
- service group,
- deployment profile,
- optional container name,
- allowed config plugin id.

The container cannot ask for another profile. Vault derives the target from the API key and returns the latest active published version.

## Failures

At startup, the client retries network errors, timeouts, HTTP 429, and HTTP 502/503/504 responses for up to 15 seconds. After any successful fetch it writes an AES-256-GCM encrypted last-known-good response under `.bsb/config-vault` in the service working directory. The cache key is derived from the runtime secret and is bound to the Vault origin and key id. Mount that directory on persistent storage if the fallback must survive container replacement.

If the retry window expires, a cache no older than `staleAllowedHours` is loaded and a warning names its version and fetch time. Authentication/authorization failures, redirects, non-transient server errors, malformed responses, expired/tampered caches, and configs without an enabled service always fail closed. There is no fallback to `config-env` or `config-default`.

Startup therefore fails if:

- Vault is unreachable and no valid last-known-good cache exists,
- authentication fails,
- `vaultUrl` is not HTTPS and `allowInsecureHttp` is not enabled,
- no active version exists,
- Vault returns invalid config,
- the selected profile has no enabled service plugins.
