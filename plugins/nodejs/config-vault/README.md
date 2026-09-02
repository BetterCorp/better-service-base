# BSB Vault

`@bsb/config-vault` provides **Vault**, a secure managed configuration service for BSB.

It contains two plugins:

- `service-config-vault`: h3 + Postgres admin UI/API.
- `config-vault`: BSB config plugin that loads the latest active published config from Vault.

Runtime containers do not choose applications, groups, profiles, or versions. The Vault API key is bound server-side to an application, service group, deployment profile, and config plugin id.

## Runtime

Runtime containers activate Vault as the BSB config plugin with env vars:

```bash
BSB_CONFIG_PLUGIN=config-vault
BSB_CONFIG_PLUGIN_PACKAGE=@bsb/config-vault
vaultUrl=https://vault.example.com
apiKeyId=vk_xxx
apiSecret=vs_xxx
```

When a container restarts, it pulls the active published version for the API key's bound deployment profile.

Plugins may declare type-checked `envOverridePaths` in their `createConfigSchema` metadata. A deployment profile must explicitly enable environment overrides for that plugin before the runtime client accepts them. PVE infrastructure can then inject one Secret Manager-backed JSON value:

```bash
BSB_CONFIG_OVERRIDES='{"services":{"core":{"database":{"instance":"project:region:instance","name":"preview-core-123"}}}}'
```

The keys under `services`, `events`, and `observable` are configured plugin aliases. Objects merge recursively; arrays and scalar values replace the published value. Unknown plugins and undeclared paths fail startup. Override values are applied only in memory and are not sent to Vault or written to the last-known-good cache.

## Service

The dedicated Vault image includes `@bsb/config-vault`, all BSB observable integrations, and `@bsb/syslog`; event transport plugins remain deployment-specific:

```text
code.bettercorp.dev/bettercorp/service-base:node-vault-latest
betterweb/service-base:node-vault-latest
```

It uses the normal BSB entrypoint and configuration variables. Build it locally with:

```bash
docker build -f plugins/nodejs/config-vault/Dockerfile --build-arg BSB_BASE_IMAGE=betterweb/service-base:node-latest --build-arg BSB_PLUGIN_VERSION=latest -t betterweb/service-base:node-vault-local plugins/nodejs/config-vault
```

```yaml
service-config-vault:
  plugin: service-config-vault
  package: "@bsb/config-vault"
  enabled: true
  config:
    host: 0.0.0.0
    port: 8080
    publicUrl: https://vault.example.com
    production: true
    databaseUrl: postgres://vault:secret@postgres:5432/vault
    masterKey: BASE64_32_BYTE_KEY
    registryUrl: https://io.bsbcode.dev
    registryToken: REGISTRY_READ_TOKEN
```

`registryToken` is optional. Set it from a deployment secret when Vault must import private plugins; the registry user needs global `read` permission plus publisher, package, or organization access. Vault sends it only as a bearer token on server-side registry requests.

`masterKey` must be a base64 encoded 32-byte key. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep the value stable. If the key changes, Vault cannot decrypt configs already stored in Postgres.

## First Admin Setup

On first startup, Vault logs a one-time setup code. Open `/setup`, enter the code, create the admin user, and confirm the password. Vault generates the TOTP enrollment secret and authenticator URI after the user is created.

Vault supports multiple administrators. Invite them from Users with a one-time setup link; each user chooses a password and enrolls at least one named TOTP/passkey pair. Login verifies password, passkey, then the TOTP paired with that exact passkey. Passkeys require HTTPS in browsers unless you are using localhost for local development, and `publicUrl` must match the external URL used to open Vault.

## Admin UI

Vault has pages for Overview, Applications, Deployments, Plugins, Users, Audit, and Profile. Deployment profiles own config drafts, publishing, and container key create/rotate flows.

Vault stores profile config internally as the profile body:

```json
{
  "observable": {},
  "events": {},
  "services": {}
}
```

The admin UI builds that body from plugin catalog entries and generated config schemas. Add a plugin, enable or disable it, then fill out the schema-derived fields instead of editing JSON. Vault validates those fields server-side, applies defaults, strips unknown keys, and rejects invalid values before encrypting drafts. Vault wraps the body under the profile name internally. Container keys are generated from the deployment profile page and the UI shows the BSB container env vars once on creation or rotation.

The admin UI validates plugin config with the portable AnyVali schema before submitting; Vault repeats validation server-side. Fields carrying AnyVali `{ sensitive: true, writeonly: true }` metadata use write-only password controls. Runtime clients retry transient failures for 15 seconds and can use an encrypted 24-hour last-known-good cache; configure `staleAllowedHours=0` to disable that fallback. Authentication, authorization, redirect, server-error, and malformed-response failures never use stale config. See the plugin docs for audit-database separation and recovery details.

## Private Plugin CI Publishing

On the Plugins page, upload one or more generated `lib/schemas/{plugin-id}.plugin.json` manifests. Vault processes each file independently, lists its result, and creates a plugin-specific `bv_p_` publish token for each new plugin. Store each token as a CI secret.

Publish the executable package to your private npm registry first, then append its generated schema to Vault:

```bash
bsb client publish \
  --target "https://vault.example.com" \
  --plugin "service-private-api" \
  --token "$VAULT_PLUGIN_TOKEN"
```

The token can publish only newer schema versions for that exact plugin id, org, package, and kind. An identical CI retry is accepted unchanged; an attempt to alter an existing version is rejected. Rotate the token from the plugin catalog when required—the previous token stops working immediately. Vault stores schemas and package coordinates only; runtime containers still need access to the private npm package.
