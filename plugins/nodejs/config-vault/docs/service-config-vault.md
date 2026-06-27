# service-config-vault

`service-config-vault` runs **Vault**, the BSB managed configuration service.

Vault is self-contained:

- Postgres is the only persistent store.
- h3 serves the admin UI and JSON API.
- Config payloads are encrypted before storage.
- Passwords and API secrets are hashed.
- Runtime API keys are bound to application, service group, deployment profile, optional container name, and `config-vault`.

## First Setup

On first startup, if no admin exists, Vault logs a one-time setup code.

Open `/setup`, enter the code, and create the admin user. The initial setup accepts `000000` as the bootstrap TOTP code so the admin can be created before a permanent TOTP secret is configured.

## Admin Model

Vault uses this model:

- **Application**: product/system, for example `BetterPortal`.
- **Service Group**: logical runtime group, for example `api`, `web`, or `worker`.
- **Deployment Profile**: BSB profile, defaulting to `default`.
- **Config Draft**: editable runtime config.
- **Config Version**: immutable published snapshot.
- **Active Version**: published version assigned to the profile.
- **Runtime API Key**: key id + secret bound to one runtime target.

Containers are not locked to versions. On restart, `config-vault` pulls the active published version for its key's profile.

## Plugin Catalog

Vault stores its own plugin catalog. Entries can be:

- imported from the BSB registry,
- created manually for private plugins,
- uploaded from generated plugin schema metadata.

Application configs reference Vault catalog snapshots, not live registry records.

If a schema exists, the UI can guide config editing and validation. If no schema exists, Vault allows raw JSON object config and cannot deeply validate plugin-specific fields.

## Security

Use HTTPS for all remote runtime config fetches. The config plugin rejects `http://` unless explicitly configured for local development.

The Vault master key is required and must be supplied through deployment config. Database encryption at rest is useful, but Vault does not rely on Postgres as the secret boundary.

Generate a master key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep the value stable. If it changes, Vault cannot decrypt configs already stored in Postgres.

## Config

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
```
