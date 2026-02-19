# BSB Registry UI & API

Web interface and REST API for the BSB plugin registry. Serves both HTML (server-side rendered with Handlebars) and JSON from the same routes using content negotiation.

This plugin communicates with `service-bsb-registry` (the core) via BSB events -- not HTTP. Both plugins can run in the same process or across distributed services.

## Configuration

```yaml
service-bsb-registry-ui:
  port: 3200                     # single HTTP port for UI + API
  host: 0.0.0.0
  pageSize: 20                   # plugins per page in browse view
  uploadDir: ./.temp/registry-images
  badgesFile: ./BADGES.json
  maxImageUploadMb: 5
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | `3200` | HTTP server port |
| `host` | string | `0.0.0.0` | Bind address |
| `pageSize` | number | `20` | Plugins per page |
| `uploadDir` | string | `./.temp/registry-images` | Directory to store plugin images |
| `badgesFile` | string | `./BADGES.json` | Badge map file keyed by `org/name` |
| `maxImageUploadMb` | number | `5` | Max image upload size in MB |

## Content Negotiation

Every route serves either HTML or JSON based on the `Accept` header:

| Accept Header | Response |
|---------------|----------|
| `text/html` (browser) | Server-side rendered Handlebars template |
| `application/json` (CLI/API) | JSON response |

This means the CLI, CI/CD tools, and the web browser all use the same URL paths.

## Routes

### Public (Read)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Homepage (redirects to /plugins) |
| GET | `/plugins` | Browse plugins (search, filter, paginate) |
| GET | `/plugins/:org` | List plugins in an organization |
| GET | `/plugins/:org/:name` | Plugin detail page |
| GET | `/plugins/:org/:name/versions` | All versions of a plugin |
| GET | `/plugins/:org/:name/match?version=1.0` | Find latest patch for a major.minor |
| GET | `/plugins/:org/:name/:version/schema` | Event schema + config schema (JSON) |
| GET | `/plugins/:org/:name/:version/docs` | Documentation |
| GET | `/plugins/:org/:name/:version/types/:language` | Type definitions |
| GET | `/stats` | Registry statistics |
| GET | `/health` | Health check |

### Authenticated (Write)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/plugins` | Publish a new plugin version |
| POST | `/plugins/:org/:name/image` | Upload/replace a single plugin image |

Authentication is via `Authorization: Bearer {token}` header.

### Query Parameters

**Browse (`/plugins`)**:

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Page number (1-based) |
| `query` | string | Search query |
| `category` | enum | `service`, `observable`, `events`, `config` |
| `language` | enum | `nodejs`, `csharp`, `go`, `java`, `python` |
| `limit` | int | Results per page (1-100) |
| `offset` | int | Pagination offset |

**Docs (`/plugins/:org/:name/:version/docs`)**:

| Param | Type | Description |
|-------|------|-------------|
| `index` | int | Document index (0-based, defaults to 0) |

## Web UI Features

### Browse Page

- Plugin cards with name, description, version, category badge, language tags
- Full-text search across names, tags, and descriptions
- Filter by category and language
- Pagination with configurable page size
- Registry statistics header (total plugins, languages, downloads)

### Plugin Detail Page

- Plugin metadata (version, category, author, license, links)
- Installation instructions with copy-paste commands
- Configuration properties (from JSON Schema, with types, defaults, descriptions)
- Event schema (collapsible list with name, type badge, description; expand for input/output schemas)
- Tabbed documentation (each markdown file becomes a tab, title from first `# heading`)
- Dependencies list

### Design

- Dark theme matching BSB documentation site
- Responsive layout (desktop, tablet, mobile)
- Server-side rendered (no client-side JS framework)
- Static CSS with CSS custom properties for theming

## Publishing via API

```bash
curl -X POST http://localhost:3200/plugins \
  -H "Authorization: Bearer bsb_your_token" \
  -H "Content-Type: application/json" \
  -d @publish-payload.json
```

See [service-bsb-registry.md](service-bsb-registry.md) for the full publish request schema.

## Plugin Badges

Create a `BADGES.json` file to force specific badges:

```json
{
  "bettercorp/config-default": ["CORE", "OFFICIAL"],
  "bettercorp/events-rabbitmq": "OFFICIAL"
}
```

Badge fallback order:
1. Entry in `BADGES.json`
2. Organization name (for `org/name` plugins)
3. `COMMUNITY`

## How It Works

1. Browser requests a page (e.g. `GET /plugins/myorg/my-plugin`)
2. UI server validates route params with Zod
3. UI server emits a BSB event (e.g. `registry.plugin.get`) via the generated `BsbRegistryClient`
4. Core plugin processes the event and returns data
5. UI server renders a Handlebars template with the data (or returns JSON if `Accept: application/json`)
6. Response is sent to the browser

This architecture means the UI has zero direct database access. Swapping `events-default` for `events-rabbitmq` makes it distributed with no code changes.

## Development

### Project Structure

```
src/plugins/service-bsb-registry-ui/
  index.ts              Plugin entry point (config, lifecycle)
  http-server.ts        Fastify server, routes, Zod validation, rendering
  templates/
    layouts/
      main.hbs          Base HTML layout
    pages/
      browse.hbs        Plugin list / search results
      plugin-detail.hbs Plugin detail page
  static/
    css/
      style.css         All styles
```

### Build

```bash
npm run build           # compiles TS + copies static assets and templates
```

Templates and static files are copied from `src/` to `lib/` during build.

### Customization

Edit files in `src/plugins/service-bsb-registry-ui/`:
- `static/css/style.css` -- all styles (CSS custom properties for colors)
- `templates/pages/*.hbs` -- page templates
- `http-server.ts` -- routes and data processing

Rebuild and restart after changes.

## Deployment

### Behind Reverse Proxy

Since both UI and API are on the same port, a single proxy rule is sufficient:

```nginx
server {
    listen 443 ssl http2;
    server_name registry.example.com;

    location / {
        proxy_pass http://localhost:3200;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## See Also

- [service-bsb-registry](service-bsb-registry.md) -- Core registry (events, storage, auth, publish schema)
- [BSB Registry README](../README.md) -- Project overview
