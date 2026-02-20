# BSB Registry

Multi-language plugin registry for the BSB framework. Publish, discover, and install plugins across Node.js, C#, Go, Java, and Python.

## Architecture

The registry is two BSB plugins in one package (`@bsb/registry`):

| Plugin | Role |
|--------|------|
| **service-bsb-registry** | Core storage and business logic (event-driven, no HTTP) |
| **service-bsb-registry-ui** | Web UI + REST API on a single HTTP port (content negotiation) |

The UI plugin communicates with the core via BSB events -- they can run in the same process (`events-default`) or across services (`events-rabbitmq`).

## Quick Start

```bash
npm install
npm run build
npm run dev          # starts with sec-config.minimal.yaml (file storage, no auth)
```

Web UI: http://localhost:3200

## Docker Packaging For BSB

This project includes `Dockerfile` to build and package the registry as a BSB plugin repository artifact.

- Build image from repo root:
  ```bash
  docker build -f plugins/nodejs/bsb-registry/Dockerfile -t betterweb/bsb-registry-plugin:1.0.1 .
  ```
- Packaged output inside image:
  - `/mnt/plugins/@bsb/registry/<version>/`
  - `/mnt/plugins/@bsb/registry/latest/`

Use this output with BSB runtime images (`betterweb/service-base:9.0.0` or `betterweb/service-base:9`) by mounting/copying into `BSB_PLUGIN_DIR` (default `/mnt/plugins`).

## Configuration

All configuration lives in `sec-config.yaml`:

```yaml
service-bsb-registry:
  database:
    type: file                   # 'file' or 'postgres'
    path: ./.temp/data           # file storage directory
  auth:
    requireAuth: true            # require token for publish/delete

service-bsb-registry-ui:
  port: 3200                     # single port for UI + API
  host: 0.0.0.0
  pageSize: 20                   # plugins per page
  uploadDir: ./.temp/registry-images
  badgesFile: ./BADGES.json
  maxImageUploadMb: 5
```

See `sec-config.minimal.yaml`, `sec-config.yaml`, and `sec-config.production.yaml` for example configurations.

## Publishing Plugins

From your plugin project:

```bash
npm run build                    # generates bsb-plugin.json + schemas
npx bsb client publish           # publishes all plugins in the package
```

The CLI reads `bsb-plugin.json` and publishes each plugin entry with its event schemas, config schema, and documentation.

### Organization

Add `bsb.orgId` to your `package.json` to publish under an organization:

```json
{
  "bsb": {
    "orgId": "mycompany"
  }
}
```

| `bsb.orgId` | Plugin ID | Install command |
|---|---|---|
| _(not set)_ | `_/service-my-plugin` | `npx bsb client install service-my-plugin` |
| `mycompany` | `mycompany/service-my-plugin` | `npx bsb client install mycompany/service-my-plugin` |

## Installing Plugins

```bash
npx bsb client list              # list available plugins
npx bsb client search todo       # search by keyword
npx bsb client install myorg/service-demo-todo
```

Installed schemas go to `src/.bsb/schemas/` and generated typed clients to `src/.bsb/clients/`.

## API Tokens

Tokens are stored in a JSON file (default `./.temp/api-tokens.json`):

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

Generate a token:

```bash
node -e "console.log('bsb_' + require('crypto').randomBytes(32).toString('hex'))"
```

## Documentation

Detailed documentation for each plugin:

- [service-bsb-registry](docs/service-bsb-registry.md) -- Core registry (events, storage, auth)
- [service-bsb-registry-ui](docs/service-bsb-registry-ui.md) -- Web UI and REST API

## License

AGPL-3.0-only OR Commercial
