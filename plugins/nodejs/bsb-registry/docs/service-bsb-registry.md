# BSB Registry Core

Event-driven plugin storage and business logic for the BSB plugin registry. This plugin has no HTTP server -- it exposes all operations as BSB returnable events. The companion `service-bsb-registry-ui` plugin provides the HTTP/web layer.

## Configuration

```yaml
service-bsb-registry:
  database:
    type: file                   # 'file' or 'postgres'
    path: ./.temp/data           # file storage directory (type: file)
  auth:
    requireAuth: true            # require bearer token for write operations
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `database.type` | `'file'` or `'postgres'` | `'file'` | Storage backend |
| `database.path` | string | `./.temp/data` | Directory for file-based storage |
| `auth.requireAuth` | boolean | `true` | Require authentication for publish/delete |

## Events

All operations are exposed as returnable events. The UI/API plugin (or any other BSB plugin) calls these via the generated `BsbRegistryClient`.

### Plugin Operations

| Event | Input | Output | Description |
|-------|-------|--------|-------------|
| `registry.plugin.publish` | PublishRequest | PublishResponse | Publish a new plugin version |
| `registry.plugin.get` | `{ org, name, version? }` | RegistryEntry | Get plugin details (latest if no version) |
| `registry.plugin.list` | ListQuery | ListResults | List plugins with filtering and pagination |
| `registry.plugin.search` | SearchQuery | SearchResults | Full-text search across names, tags, descriptions |
| `registry.plugin.delete` | `{ org, name, version? }` | `{ success, deleted }` | Delete a plugin or specific version |
| `registry.plugin.versions` | `{ org, name, majorMinor? }` | VersionList | Get all versions of a plugin |

### Stats and Auth

| Event | Input | Output | Description |
|-------|-------|--------|-------------|
| `registry.stats.get` | `{}` | RegistryStats | Total plugins, counts by language/category |
| `registry.auth.login` | `{ username, password }` | `{ success, token?, message? }` | Login (not yet implemented -- use tokens) |
| `registry.auth.verify` | `{ token }` | `{ valid, userId?, permissions? }` | Verify a bearer token |

## Publish Request Schema

The publish request is the primary write operation. The body is validated by the UI/API plugin at the HTTP boundary and passed as a structured object through events.

```json
{
  "org": "mycompany",
  "name": "service-my-plugin",
  "version": "1.0.0",
  "language": "nodejs",
  "metadata": {
    "displayName": "My Plugin",
    "description": "Short description of the plugin",
    "category": "service",
    "tags": ["example", "demo"],
    "author": "Author Name",
    "license": "MIT",
    "homepage": "https://example.com",
    "repository": "https://github.com/org/repo"
  },
  "eventSchema": {
    "pluginName": "service-my-plugin",
    "version": "1.0.0",
    "events": {
      "my-plugin.do-something": {
        "type": "returnable",
        "category": "onReturnableEvents",
        "description": "Does something",
        "inputSchema": { "type": "object", "properties": {} },
        "outputSchema": { "type": "object", "properties": {} }
      }
    },
    "dependencies": []
  },
  "configSchema": {
    "type": "object",
    "properties": {
      "port": { "type": "number", "default": 3000, "description": "Server port" }
    },
    "required": ["port"]
  },
  "documentation": [
    "# My Plugin\n\nThis is the main readme content...",
    "# API Reference\n\nDetailed API documentation..."
  ],
  "dependencies": [
    { "id": "bettercorp/service-other", "version": "^1.0.0" }
  ],
  "package": {
    "nodejs": "@mycompany/my-plugin"
  },
  "runtime": {
    "nodejs": ">=18.0.0"
  },
  "visibility": "public"
}
```

### Field Reference

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `org` | yes | string | Organization name (use `_` for unaffiliated) |
| `name` | yes | string | Plugin name |
| `version` | yes | string | Semver version (e.g. `1.0.0`) |
| `language` | yes | enum | `nodejs`, `csharp`, `go`, `java`, `python` |
| `metadata` | yes | object | Display info (displayName, description, category, tags, etc.) |
| `eventSchema` | yes | object | EventSchemaExport object from build |
| `configSchema` | no | object | JSON Schema for plugin configuration (must have `type: "object"`) |
| `documentation` | yes | string[] | Array of markdown strings (min 1, max 20). Title extracted from first `# heading` |
| `dependencies` | no | array | Plugin dependencies `[{ id, version }]` |
| `package` | no | object | Language-specific package names (npm, NuGet, etc.) |
| `runtime` | no | object | Runtime version requirements |
| `visibility` | no | enum | `public` (default) or `private` |

### Version Immutability

Published versions are immutable. Attempting to publish the same org/name/version will return an error. Publish a new version instead.

## Storage

### File Storage (Default)

Stores plugin data as JSON files in the configured directory. Suitable for development and single-instance deployments.

### PostgreSQL (Production)

For multi-instance or high-availability deployments. Set `database.type: postgres` and provide the connection URL. Migrations run automatically on first start.

## Authentication

Authentication is enforced at the HTTP layer (by `service-bsb-registry-ui`). The core plugin trusts event callers -- if you are calling events directly from another BSB plugin, no token is needed.

API tokens are stored in a JSON file:

```json
{
  "tokens": [
    {
      "name": "ci-deploy",
      "token": "bsb_abc123...",
      "createdAt": "2026-02-13T00:00:00Z",
      "permissions": ["read", "write"]
    }
  ]
}
```

Permissions:
- `read` -- list, search, get plugin details
- `write` -- publish and delete plugins
- `admin` -- all operations

## See Also

- [service-bsb-registry-ui](service-bsb-registry-ui.md) -- Web UI and REST API
- [BSB Registry README](../README.md) -- Project overview
