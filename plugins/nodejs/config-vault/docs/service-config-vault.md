# service-config-vault

`service-config-vault` runs **Vault**, the BSB managed configuration service.

Vault is self-contained:

- Postgres is the only persistent store.
- h3 serves the admin UI and JSON API.
- Config payloads are encrypted before storage.
- Passwords and runtime API secrets are hashed; TOTP seeds and config payloads are encrypted.
- Container API keys are created from a deployment profile and bound server-side to application, deployment, deployment profile, optional container name, and `config-vault`.

## Container Image

Use `code.bettercorp.dev/bettercorp/service-base:node-vault-latest` or `betterweb/service-base:node-vault-latest`. Versioned releases use `node-vault-VERSION`; prerelease channels also publish `node-vault-NPM_TAG`.

The image keeps the standard BSB entrypoint and configuration model. It bundles `@bsb/config-vault`, the Axiom, Graylog, file, OpenTelemetry, Pino, Winston, and Zipkin observable plugins, plus `@bsb/syslog`. The base image already provides the default observable plugin. Event transport plugins are intentionally not bundled.

Build locally with:

```bash
docker build -f plugins/nodejs/config-vault/Dockerfile --build-arg BSB_BASE_IMAGE=betterweb/service-base:node-latest --build-arg BSB_PLUGIN_VERSION=latest -t betterweb/service-base:node-vault-local plugins/nodejs/config-vault
```

## First Setup

On first startup, if no admin exists, Vault logs a one-time setup code.

Open `/setup`, enter the code, create the admin user, and confirm the password. Vault then generates the TOTP enrollment secret and authenticator URI for that user. Add it to an authenticator app before logging in.

On first login, the first admin verifies the generated TOTP and enrolls its paired passkey. Normal login is password, passkey, then the TOTP belonging to that exact passkey method. A user may have multiple named TOTP/passkey pairs, but an active user cannot delete the final pair.

Every active user is an administrator. The Users page creates a 24-hour one-time setup link from an email address; it does not transmit or retain a generated plaintext password. The invited user chooses a password and must finish both TOTP and passkey enrollment before activation. Deactivation preserves identity and history while revoking sessions and authentication methods. Reset Access issues another one-time setup link. The last active administrator cannot be deactivated or reset.

## Admin UI

Vault uses a structured admin UI:

- **Overview**: inventory counts and recent runtime keys.
- **Applications**: create, edit, delete, and list applications.
- **Deployments**: create deployments, open profiles, add/remove configured plugins, edit schema-derived plugin settings, publish drafts, and create or rotate container keys.
- **Plugins**: create private/manual plugin catalog entries and attach schemas.
- **Users**: invite, deactivate, and reset administrator access.
- **Audit**: inspect and verify the signed append-only audit chain.
- **Profile**: add, label, and remove paired TOTP/passkey methods.

Existing installations are migrated automatically: legacy TOTP is encrypted into the paired-method table and each existing passkey is paired with that seed. The legacy TOTP column is cleared after migration.

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

AnyVali fields described with `{ sensitive: true, writeonly: true }` render as password controls and are never returned into editable page data. An unchanged blank control preserves the encrypted value; Replace permits a new value (including a schema-valid empty string), and disabling an optional sensitive field explicitly clears it.

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

The admin UI uses session-bound CSRF tokens, throttles authentication failures, sets no-store and browser hardening headers, and uses a per-response CSP nonce. Production mode requires an HTTPS `publicUrl`. Runtime key secrets and user setup links are displayed once in the response body and are never placed in URLs.

Audit rows are HMAC signed and hash-chained. A database trigger rejects update, delete, and truncate operations; preflight integrity verification blocks state-changing requests if the chain is invalid or the audit database is unavailable. Older unsigned audit rows receive a signed digest anchor during migration. Runtime config reads remain available when a separately configured audit database is unavailable and emit a warning if their best-effort read event cannot be recorded.

For stronger separation, set `auditDatabaseUrl` to a dedicated Postgres database and give the configured account only connection, schema usage, sequence usage, table insert, and table select permissions after initial schema creation. Do not grant update, delete, truncate, or trigger-management permissions to the steady-state writer account.

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
    registryToken: REGISTRY_READ_TOKEN
    auditDatabaseUrl: postgres://vault_audit_writer:secret@audit-postgres:5432/vault_audit
```

`registryToken` and `auditDatabaseUrl` are optional. Supply all connection strings, tokens, and `masterKey` through deployment secrets rather than checked-in config.
