# BSB Registry API

Multi-language plugin discovery and publishing system for the BSB framework. The Registry API provides an HTTP REST interface for publishing, discovering, and managing BSB plugins across all languages (Node.js, C#, Go, Java, Python).

## Overview

The BSB Registry is similar to npm registry, but designed specifically for BSB plugins with support for multi-language implementations, organization-based naming, and flexible version matching. It serves as the central hub for plugin distribution and discovery in the BSB ecosystem.

### Key Features

✅ **Multi-Language Support** - Serve plugins for Node.js, C#, Go, Java, Python
✅ **Organization Naming** - Docker-style `org/plugin-name` format
✅ **HTTP REST API** - Publish and discover plugins via HTTP
✅ **Flexible Storage** - SQLite for single instance or PostgreSQL for production
✅ **Bearer Authentication** - Token-based auth for write operations
✅ **Full-Text Search** - Fast plugin discovery
✅ **Version Matching** - Flexible major.minor with patch interchangeability
✅ **Documentation Hosting** - README, changelog, API reference
✅ **Self-Hostable** - Run your own private registry

### Architecture

The registry consists of two plugins (can be deployed together or separately):

1. **service-bsb-registry** (this plugin) - HTTP API backend on port 3100
2. **service-bsb-registry-ui** - Web interface on port 3200

---

## Installation

### Prerequisites

Ensure you have the following:

- BSB core plugins (observable, events, config)
- Node.js 18+ for runtime
- SQLite (included) or PostgreSQL (for production)

### Install the Plugin

```bash
npm install @bsb/registry
```

Or install from source:

```bash
cd plugins/nodejs/bsb-registry
npm install
npm run build
```

## Configuration

Add to your BSB `sec-config.yaml`:

```yaml
# Registry API Backend
service-bsb-registry:
  database:
    type: sqlite              # 'sqlite' or 'postgres'
    path: ./.temp/registry.db # SQLite database file
    # url: postgresql://... # PostgreSQL connection string
  http:
    port: 3100                # API server port
    host: 0.0.0.0             # Listen address
    cors: true                # Enable CORS
  auth:
    tokensFile: ./.temp/api-tokens.json
    requireAuth: true         # Require auth for write ops
```

### Production Configuration (PostgreSQL)

```yaml
service-bsb-registry:
  database:
    type: postgres
    url: ${DATABASE_URL}      # From environment variable
  http:
    port: ${PORT:-3100}
    host: 0.0.0.0
    cors: true
  auth:
    tokensFile: /etc/bsb-registry/api-tokens.json
    requireAuth: true
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `database.type` | Database type: sqlite or postgres | `sqlite` |
| `database.path` | SQLite database file path | `./.temp/registry.db` |
| `database.url` | PostgreSQL connection string | `undefined` |
| `http.port` | HTTP server port | `3100` |
| `http.host` | Bind address | `0.0.0.0` |
| `http.cors` | Enable CORS headers | `true` |
| `auth.tokensFile` | API tokens JSON file path | `./.temp/api-tokens.json` |
| `auth.requireAuth` | Require authentication for write operations | `true` |

---

## API Reference

### Health & Stats

```bash
GET /health                     # Health check
GET /api/stats                  # Registry statistics
```

### Plugin Discovery (Public)

```bash
# List all plugins
GET /api/plugins
  ?org=bettercorp              # Filter by organization
  &language=nodejs             # Filter by language
  &category=service            # Filter by category
  &limit=50                    # Results per page
  &offset=0                    # Pagination offset

# Search plugins
GET /api/plugins/search?q=todo

# Get plugin details
GET /api/plugins/{org}/{name}

# Get all versions
GET /api/plugins/{org}/{name}/versions

# Match version (find latest patch for major.minor)
GET /api/plugins/{org}/{name}/match?version=1.0

# Get event schema
GET /api/plugins/{org}/{name}/{version}/schema

# Get type definitions
GET /api/plugins/{org}/{name}/{version}/types/{language}

# Get documentation
GET /api/plugins/{org}/{name}/{version}/docs

# Get organization
GET /api/orgs/{org}
```

### Plugin Publishing (Authenticated)

```bash
# Publish new plugin
POST /api/plugins
Authorization: Bearer {token}
Content-Type: application/json

# Update plugin
PUT /api/plugins/{org}/{name}
Authorization: Bearer {token}

# Delete plugin
DELETE /api/plugins/{org}/{name}
Authorization: Bearer {token}
```

### Example: Publish Plugin

```bash
curl -X POST http://localhost:3100/api/plugins \
  -H "Authorization: Bearer bsb_your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "org": "bettercorp",
    "name": "service-demo",
    "version": "1.0.0",
    "language": "nodejs",
    "metadata": {
      "displayName": "Demo Service",
      "description": "Example service plugin",
      "category": "service",
      "tags": ["demo", "example"]
    },
    "eventSchema": {...},
    "typeDefinitions": {...},
    "documentation": {
      "readme": "# Demo Service\\n\\nDescription...",
      "changelog": "# Changelog\\n\\n## 1.0.0\\n- Initial release"
    }
  }'
```

### Example: Search Plugins

```bash
curl http://localhost:3100/api/plugins/search?q=todo
```

---

## Authentication

API tokens are stored in a JSON file (default: `./.temp/api-tokens.json`):

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

### Generate a Token

```bash
# Generate random token
node -e "console.log('bsb_' + require('crypto').randomBytes(32).toString('hex'))"
```

Then add it to your tokens file.

### Using Tokens

Send tokens in the `Authorization` header:

```bash
Authorization: Bearer bsb_your_token_here
```

---

## Usage with BSB CLI

### Configure CLI

```bash
# Set registry URL (optional if using default)
export BSB_REGISTRY_URL=http://localhost:3100

# Set API token for publishing
export BSB_REGISTRY_TOKEN=bsb_your_token_here
```

### Publish Plugin

From your plugin project:

```bash
# Export schemas and generate types
npx bsb client sync

# Publish to registry
npx bsb client publish
```

### Install Plugin

```bash
# List available plugins
npx bsb client list

# Search for plugins
npx bsb client search todo

# Install plugin (downloads schema + generates types)
npx bsb client install org/plugin-name
```

Installed schemas and types go to:
- `lib/schemas/remote/{plugin-name}.json`
- `lib/types/remote/{plugin-name}.d.ts`

---

## Database

### SQLite (Default)

Automatically created at configured path. Ideal for:
- Development environments
- Single-instance deployments
- Low-traffic registries

### PostgreSQL (Production)

Recommended for:
- Multi-instance deployments
- High-availability setups
- Large registries (1000+ plugins)

The registry automatically runs migrations on first start.

---

## Deployment

### Local Development

```bash
# Start with minimal config
npm run dev
```

Access at http://localhost:3100

### Production with Docker

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Configure environment
export DATABASE_URL=postgresql://registry:password@localhost:5432/bsb_registry
export BSB_REGISTRY_TOKEN=bsb_your_production_token

# Start registry
BSB_CONFIG_PATH=sec-config.production.yaml npm start
```

### Behind Reverse Proxy (nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name registry.bsbcode.dev;

    location /api/ {
        proxy_pass http://localhost:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Troubleshooting

### Database Locked (SQLite)

**Problem**: SQLite database locked errors

**Solution**: Use PostgreSQL for multi-instance deployments. SQLite is single-writer.

### CORS Errors

**Problem**: CORS errors from web UI

**Solution**: Ensure `http.cors: true` in configuration

### Authentication Failures

**Problem**: 401 Unauthorized errors

**Solution**:
1. Verify token in `./.temp/api-tokens.json`
2. Check `Authorization: Bearer {token}` header format
3. Ensure `auth.requireAuth: true` if auth is expected

### Port Conflicts

**Problem**: Port already in use

**Solution**: Change `http.port` in configuration (default 3100)

---

## See Also

- [BSB Registry Web UI](/plugins/service/service-bsb-registry-ui/) - Browse plugins in your browser
- [BSB CLI Documentation](/guides/cli/) - Command-line plugin management
- [Publishing Plugins](/guides/publishing/) - How to publish your plugins
