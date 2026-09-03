# config-vault-google

`config-vault-google` loads BSB runtime config from Vault and adds Google Cloud Run service-to-service authentication.

```bash
BSB_CONFIG_PLUGIN=config-vault-google
BSB_CONFIG_PLUGIN_PACKAGE=@bsb/config-vault-google
vaultUrl=https://vault-run-url.a.run.app
googleAudience=https://vault-run-url.a.run.app
apiKeyId=vk_xxx
apiSecret=vs_xxx
# cacheDir=/mounted/config-vault
```

`googleAudience` must be the Cloud Run service URL. The existing Vault API key and secret still decide which runtime profile can be loaded.

`config-vault-google` also accepts the same optional `cacheDir` and profile-authorized `BSB_CONFIG_OVERRIDES` settings as `config-vault`; overrides are applied locally after the Vault response is loaded.
