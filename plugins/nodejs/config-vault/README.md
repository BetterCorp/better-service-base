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

## Service

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
```

`masterKey` must be a base64 encoded 32-byte key. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep the value stable. If the key changes, Vault cannot decrypt configs already stored in Postgres.

## First Admin Setup

On first startup, Vault logs a one-time setup code. Open `/setup`, enter the code, create the admin user, and confirm the password. Vault generates the TOTP enrollment secret and authenticator URI after the user is created.

Vault has exactly one admin user. Treat that as part of the security model, not a missing team-management feature.

On the first login, Vault verifies password and TOTP, then checks whether the admin has a registered passkey. If no passkey exists, Vault sends the admin through browser passkey enrollment and then forces a fresh login.

After enrollment, every admin login requires password, TOTP, and a browser passkey assertion. Passkeys require HTTPS in browsers unless you are using localhost for local development, and `publicUrl` must match the external URL used to open Vault.

## Admin UI

Vault has pages for Overview, Applications, Deployments, Plugins, and Profile. Deployment profiles own config drafts, publishing, and container key create/rotate flows.

Vault stores profile config internally as the profile body:

```json
{
  "observable": {},
  "events": {},
  "services": {}
}
```

The admin UI builds that body from plugin catalog entries and generated config schemas. Add a plugin, enable or disable it, then fill out the schema-derived fields instead of editing JSON. Vault validates those fields server-side, applies defaults, strips unknown keys, and rejects invalid values before encrypting drafts. Vault wraps the body under the profile name internally. Container keys are generated from the deployment profile page and the UI shows the BSB container env vars once on creation or rotation.
