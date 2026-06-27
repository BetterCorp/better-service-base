# service-config-vault

`service-config-vault` runs **Vault**, the BSB managed configuration service.

Vault is self-contained:

- Postgres is the only persistent store.
- h3 serves the admin UI and JSON API.
- Config payloads are encrypted before storage.
- Passwords and API secrets are hashed.
- Container API keys are created from a deployment profile and bound server-side to application, deployment, deployment profile, optional container name, and `config-vault`.

## First Setup

On first startup, if no admin exists, Vault logs a one-time setup code.

Open `/setup`, enter the code, create the admin user, and confirm the password. Vault then generates the TOTP enrollment secret and authenticator URI for that user. Add it to an authenticator app before logging in.

Vault is intentionally single-admin. Do not add multiple admin users without redesigning authorization, recovery, and audit ownership.

Passkeys are not configured by pasting JSON into setup. On first login, Vault verifies password and TOTP, then forces browser passkey enrollment if no passkey exists. After enrollment succeeds, the temporary setup token is cleared and the admin must log in again.

Normal admin login requires all three factors: password, TOTP, and passkey. Browser passkeys require HTTPS unless running on localhost. Set `publicUrl` to the same origin users open in the browser so WebAuthn origin and RP ID validation works.

## Admin UI

Vault uses a structured admin UI:

- **Overview**: inventory counts and recent runtime keys.
- **Applications**: create, edit, delete, and list applications.
- **Deployments**: create deployments, open profiles, add/remove configured plugins, edit schema-derived plugin settings, publish drafts, and create or rotate container keys.
- **Plugins**: create private/manual plugin catalog entries and attach schemas.
- **Profile**: account information and passkey accounts.

Passkey management belongs under **Profile**. First-login enrollment still uses the temporary passkey setup page because no authenticated session exists yet.

## Admin Model

Vault uses this model:

- **Application**: product/system, for example `BetterPortal`.
- **Deployment**: logical runtime group, for example `api`, `web`, or `worker`. A new deployment automatically gets a `default` profile.
- **Deployment Profile**: BSB profile, defaulting to `default`.
- **Config Draft**: editable runtime config.
- **Config Version**: immutable published snapshot.
- **Active Version**: published version assigned to the profile.
- **Container API Key**: key id + secret created from one deployment profile. The secret is shown only on creation or rotation.

Profile config is stored internally as the body of that profile:

```json
{
  "observable": {},
  "events": {},
  "services": {}
}
```

Admins should not hand-author this JSON in normal use. The profile page uses the plugin catalog and each plugin's generated config schema so an admin can add a service/events/observable plugin, enable or disable it, and fill out structured fields. Strings, numbers, booleans, enums, nested objects, arrays, records, and tuples are rendered as form controls where possible. Vault wraps the resulting profile body internally under the deployment profile name before publishing, for example `{ "default": { ... } }`. Containers do not choose a profile; the key already binds them to exactly one profile.

Schema validation is enforced server-side when saving a profile plugin. Vault applies schema defaults, coerces primitive HTML form values where safe, strips unknown object keys, and rejects invalid values before encrypting the draft. The browser form is only a convenience layer; API callers cannot bypass schema validation.

Containers are not locked to versions. On restart, `config-vault` pulls the active published version for its key's profile.

Deleting an application deletes its deployments and related deployment data. Deleting a deployment deletes its deployment profiles and related deployment data. Deleting a deployment profile deletes its config drafts, versions, and container keys.

## Plugin Catalog

Vault stores its own plugin catalog. Entries can be:

- imported from the BSB registry,
- created manually for private plugins,
- uploaded from generated plugin schema metadata.

Application configs reference Vault catalog snapshots, not live registry records.

If a schema exists, the UI guides config editing and Vault validates the saved shape. If no schema exists, Vault allows object config and cannot deeply validate plugin-specific fields.

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
    registryUrl: https://io.bsbcode.dev
```
