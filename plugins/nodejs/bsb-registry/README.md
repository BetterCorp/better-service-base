# BSB Registry

Multi-language plugin discovery and publishing system for the BSB framework. Similar to npm registry, but supports plugins from Node.js, C#, Go, Java, Python, and more.

## Features

- **Multi-Language Support**: Serve plugins for any language (Node.js, C#, Go, Java, Python)
- **Organization-Based Naming**: Docker-style naming - `org/plugin-name`
- **Version Matching**: Flexible major.minor matching with patch interchangeability
- **HTTP REST API**: Publish and discover plugins via HTTP
- **Web UI**: Browse and search plugins at http://localhost:3200
- **Documentation Publishing**: README, changelog, API reference
- **Self-Hostable**: Run your own private registry
- **Type Definitions**: Language-specific type definitions (TypeScript, C#, Go, Java)

## Architecture

The registry consists of two BSB plugins:

1. **service-bsb-registry** - HTTP REST API backend (port 3100)
2. **service-bsb-registry-ui** - Web interface (port 3200)

Both can be deployed together or separately.

## Quick Start

### 1. Build the Registry

```bash
npm install
npm run build
```

### 2. Start with Minimal Config (SQLite, No Auth)

```bash
npm run dev
```

This uses `sec-config.minimal.yaml`:
- SQLite database at `./.temp/registry.db`
- No authentication required
- Debug logging enabled

**Access:**
- API: http://localhost:3100
- Web UI: http://localhost:3200

### 3. Start with Full Config (SQLite, With Auth)

```bash
BSB_CONFIG_PATH=sec-config.yaml npm start
```

This uses `sec-config.yaml`:
- SQLite database
- Authentication required for write operations
- Token file at `./.temp/api-tokens.json`

### 4. Start with PostgreSQL (Production-Like)

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Configure database URL
export DATABASE_URL=postgresql://registry:registry_dev_password@localhost:5432/bsb_registry

# Start registry
BSB_CONFIG_PATH=sec-config.production.yaml npm start
```

## Configuration Files

| File | Purpose | Database | Auth | Logging |
|------|---------|----------|------|---------|
| `sec-config.minimal.yaml` | Local dev (quick start) | SQLite | Disabled | Debug |
| `sec-config.yaml` | Development | SQLite | Enabled | Info |
| `sec-config.production.yaml` | Production | PostgreSQL | Enabled | OpenTelemetry + Graylog |

## API Endpoints

### Public (Read-Only)

```
GET /health                                      Health check
GET /api/stats                                   Registry statistics
GET /api/plugins                                 List all plugins
GET /api/plugins/search?q=todo                   Search plugins
GET /api/plugins/{org}/{name}                    Get plugin details
GET /api/plugins/{org}/{name}/versions           Get all versions
GET /api/plugins/{org}/{name}/match?version=1.0  Match version (latest patch)
GET /api/plugins/{org}/{name}/{version}/schema   Get event schema (JSON)
GET /api/plugins/{org}/{name}/{version}/types/{language}  Get type definitions
GET /api/plugins/{org}/{name}/{version}/docs     Get documentation
GET /api/orgs/{org}                              Get organization info
```

### Authenticated (Write Operations)

```
POST /api/plugins                                Publish new plugin
PUT /api/plugins/{org}/{name}                    Update plugin
DELETE /api/plugins/{org}/{name}                 Delete plugin
```

**Authentication**: Send Bearer token in `Authorization` header:

```bash
curl -X POST http://localhost:3100/api/plugins \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d @publish-payload.json
```

## Managing API Tokens

Tokens are stored in `./.temp/api-tokens.json` (configurable via `auth.tokensFile`).

**Token file format:**

```json
{
  "tokens": [
    {
      "name": "admin",
      "token": "bsb_abc123...",
      "createdAt": "2026-02-13T00:00:00Z",
      "permissions": ["read", "write", "admin"]
    }
  ]
}
```

**Generate a token manually:**

```bash
# Generate random token
node -e "console.log('bsb_' + require('crypto').randomBytes(32).toString('hex'))"
```

Then add it to `./.temp/api-tokens.json`.

## Publishing Plugins

From your plugin project, use the BSB CLI:

```bash
# Export schemas and generate types
npx bsb client sync

# Publish to registry
npx bsb client publish
```

This uploads:
- Plugin metadata (name, version, category, tags)
- Event schemas (BSB format - language-agnostic)
- Type definitions (TypeScript, C#, Go, Java)
- Documentation (README, changelog)

## Installing Plugins

```bash
# List available plugins
npx bsb client list

# Search for plugins
npx bsb client search todo

# Install plugin (downloads schema + generates types)
npx bsb client install bettercorp/service-demo-todo
```

Installed schemas and types go to:
- `lib/schemas/remote/{plugin-name}.json`
- `lib/types/remote/{plugin-name}.d.ts`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BSB_CONFIG_PATH` | `sec-config.yaml` | Path to config file |
| `DATABASE_URL` | - | PostgreSQL connection string |
| `PORT` | `3100` | Registry API port |
| `UI_PORT` | `3200` | Registry UI port |
| `REGISTRY_API_URL` | `http://localhost:3100` | API URL for UI |
| `OTEL_ENDPOINT` | `http://localhost:4318/v1/traces` | OpenTelemetry endpoint |
| `GRAYLOG_HOST` | - | Graylog server hostname |

## Web UI

Access at http://localhost:3200

Features:
- Browse all plugins
- Search by name, tags, description
- Filter by category (service, observable, events, config)
- Filter by language (nodejs, csharp, go, java, python)
- Sort by name, recent, popular
- View plugin details (events, documentation, installation)
- Dark theme matching BSB docs site

## Development

```bash
# Install dependencies
npm install

# Build (compile TypeScript + copy assets)
npm run build

# Start in dev mode (minimal config)
npm run dev

# Clean build artifacts
npm run clean

# Run tests
npm test
```

## Troubleshooting

**Database locked (SQLite)**
- Only use SQLite for single instance
- Use PostgreSQL for multi-instance deployments

**CORS errors**
- Ensure `http.cors: true` in API config
- Ensure `cors: true` in UI config
- Check `apiUrl` in UI config matches API location

**Authentication failures**
- Verify token in `./.temp/api-tokens.json`
- Check `Authorization: Bearer {token}` header
- Ensure `auth.requireAuth: true` for write ops

**Port conflicts**
- Change `http.port` in registry config (default 3100)
- Change `port` in UI config (default 3200)

## License

MIT
