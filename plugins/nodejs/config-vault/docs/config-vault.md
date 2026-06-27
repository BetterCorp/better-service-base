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
```

The lower camel case keys are intentional. BSB reads config plugin env vars from the plugin schema, so `vaultUrl`, `apiKeyId`, `apiSecret`, `timeoutMs`, and `allowInsecureHttp` are the exact keys used by this plugin.

The API key is bound in Vault to:

- application,
- service group,
- deployment profile,
- optional container name,
- allowed config plugin id.

The container cannot ask for another profile. Vault derives the target from the API key and returns the latest active published version.

## Failures

Startup fails if:

- Vault is unreachable,
- authentication fails,
- `vaultUrl` is not HTTPS and `allowInsecureHttp` is not enabled,
- no active version exists,
- Vault returns invalid config,
- the selected profile has no enabled service plugins.

There is no fallback chain to `config-env` or `config-default`.
