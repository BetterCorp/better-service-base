# Registry File DB

File-based storage backend for the BSB Registry. Stores all data as JSON files in a configurable directory. This is the default storage backend -- suitable for development, single-instance deployments, and small registries.

## Configuration

```yaml
service-bsb-registry:
  database:
    type: file
    path: ./.temp/data
```

The `path` is the root directory. All subdirectories and files are created automatically on first startup.

## Directory Layout

```
<path>/
  plugins/
    <org>/
      <name>/
        <version>.json          # RegistryEntry for each published version
  orgs/
    <orgId>.json                # Organization metadata + members
  users.json                    # User[] array
  tokens.json                   # AuthToken[] array
```

## File Schemas

### Plugin Version -- `plugins/<org>/<name>/<version>.json`

One file per published version. Created on publish, never modified (versions are immutable).

```json
{
  "id": "mycompany/service-demo",
  "org": "mycompany",
  "name": "service-demo",
  "displayName": "Demo Service",
  "description": "Example service plugin",
  "version": "1.0.0",
  "majorMinor": "1.0",
  "language": "nodejs",
  "category": "service",
  "tags": ["demo", "example"],
  "visibility": "public",
  "eventSchema": {
    "demo.do-something": {
      "type": "returnable",
      "category": "onReturnableEvents",
      "description": "Does something",
      "inputSchema": { "type": "object", "properties": {} },
      "outputSchema": { "type": "object", "properties": {} }
    }
  },
  "configSchema": {
    "type": "object",
    "properties": {
      "port": { "type": "number", "default": 3000, "description": "Server port" }
    },
    "required": ["port"]
  },
  "documentation": [
    "# Demo Service\n\nMain documentation content..."
  ],
  "dependencies": [],
  "package": {
    "nodejs": "@mycompany/service-demo"
  },
  "runtime": {
    "nodejs": ">=18.0.0"
  },
  "author": {
    "name": "Author Name",
    "email": "author@example.com"
  },
  "license": "MIT",
  "homepage": "https://example.com",
  "repository": "https://github.com/mycompany/service-demo",
  "eventCount": 1,
  "emitEventCount": 0,
  "onEventCount": 0,
  "returnableEventCount": 1,
  "broadcastEventCount": 0,
  "publishedBy": "user-uuid-here",
  "publishedAt": "2026-02-17T00:00:00.000Z",
  "updatedAt": "2026-02-17T00:00:00.000Z",
  "downloads": 0
}
```

#### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Full ID (`org/name`) |
| `org` | string | yes | Organization name |
| `name` | string | yes | Plugin name |
| `displayName` | string | yes | Human-readable name |
| `description` | string | yes | Short description (max 1000 chars) |
| `version` | string | yes | Semver (`1.0.0`) |
| `majorMinor` | string | yes | Major.minor only (`1.0`) |
| `language` | enum | yes | `nodejs`, `csharp`, `go`, `java`, `python` |
| `category` | enum | yes | `service`, `observable`, `events`, `config` |
| `tags` | string[] | yes | Searchable keywords |
| `visibility` | enum | yes | `public` or `private` |
| `eventSchema` | object | yes | Events map (`Record<eventName, EventExportEntry>`) |
| `configSchema` | object | no | JSON Schema for plugin config (`type: "object"`) |
| `documentation` | string[] | no | Array of markdown strings |
| `dependencies` | array | no | `[{ id: "org/name", version: "^1.0.0" }]` |
| `package` | object | no | Language-specific package names |
| `runtime` | object | no | Runtime version requirements |
| `author` | string or object | no | Author name or `{ name, email?, url? }` |
| `license` | string | no | License identifier |
| `homepage` | string | no | Documentation URL |
| `repository` | string | no | Source repository URL |
| `eventCount` | int | yes | Total event count |
| `emitEventCount` | int | yes | Fire-and-forget emit events |
| `onEventCount` | int | yes | Fire-and-forget on events |
| `returnableEventCount` | int | yes | Returnable events |
| `broadcastEventCount` | int | yes | Broadcast events |
| `publishedBy` | string | yes | User ID or `"system"` |
| `publishedAt` | ISO datetime | yes | First publish timestamp |
| `updatedAt` | ISO datetime | yes | Last update timestamp |
| `downloads` | int | no | Download count (default 0) |

### Organization -- `orgs/<orgId>.json`

One file per organization. Created when an organization is first set up.

```json
{
  "id": "mycompany",
  "name": "mycompany",
  "displayName": "My Company",
  "pluginCount": 0,
  "visibility": "public",
  "members": [
    {
      "userId": "user-uuid-here",
      "permission": "write"
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Organization ID |
| `name` | string | yes | Organization name (same as ID) |
| `displayName` | string | yes | Human-readable display name |
| `pluginCount` | int | yes | Stored count (live count computed on read) |
| `visibility` | enum | yes | `public` or `private` |
| `members` | array | no | `[{ userId, permission }]` |

Member permissions: `read` or `write`.

### Users -- `users.json`

Single file containing all registered users as a JSON array.

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Admin User",
    "email": "admin@example.com",
    "active": true,
    "permissions": ["read", "write", "create-org"],
    "createdAt": "2026-02-17T00:00:00.000Z",
    "updatedAt": "2026-02-17T00:00:00.000Z"
  }
]
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | yes | User ID |
| `name` | string | yes | Display name |
| `email` | string | yes | Email address |
| `active` | boolean | yes | Account active flag |
| `permissions` | string[] | yes | User-level permissions: `read`, `write`, `create-org` |
| `createdAt` | ISO datetime | yes | Account creation time |
| `updatedAt` | ISO datetime | yes | Last update time |

### Tokens -- `tokens.json`

Single file containing all API tokens as a JSON array.

```json
[
  {
    "token": "bsb_abc123...",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "CI deploy",
    "permissions": ["read", "write"],
    "createdAt": "2026-02-17T00:00:00.000Z",
    "expiresAt": null
  }
]
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | yes | Bearer token string |
| `userId` | UUID | yes | Owner user ID |
| `name` | string | yes | Token label (e.g. "CI deploy", "laptop") |
| `permissions` | string[] | no | Token-scoped permissions (inherits from user if omitted) |
| `createdAt` | ISO datetime | yes | Token creation time |
| `expiresAt` | ISO datetime | no | Optional expiration (null = never expires) |

## Bootstrapping

On first startup, the file DB creates the directory structure and empty `users.json` / `tokens.json` files automatically. No manual setup is needed.

To seed initial data, create the files manually before starting the service:

1. Create `users.json` with at least one admin user
2. Create `tokens.json` with a token tied to that user
3. Start the service -- it will use the existing files

Generate a token string:

```bash
node -e "console.log('bsb_' + require('crypto').randomBytes(32).toString('hex'))"
```

## Limitations

- Single-writer only -- no concurrent process safety
- All queries scan files on disk (no indexing)
- Not suitable for large registries (1000+ plugins)
- No automatic backups -- back up the data directory yourself

For production or multi-instance deployments, use PostgreSQL (`database.type: postgres`).

## See Also

- [service-bsb-registry](service-bsb-registry.md) -- Core registry plugin
- [service-bsb-registry-ui](service-bsb-registry-ui.md) -- Web UI and REST API
