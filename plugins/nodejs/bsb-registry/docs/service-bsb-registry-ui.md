# BSB Registry UI & API

Event-driven web interface and REST API for browsing and searching BSB plugins. Supports content negotiation - serves HTML or JSON based on Accept header. Communicates with registry core via events (not HTTP).

## Overview

The BSB Registry UI & API is a companion plugin to the BSB Registry core, providing both:
- **Web UI**: Modern dark-themed interface with server-side rendered Handlebars templates
- **REST API**: JSON responses for programmatic access (CLI tools, CI/CD)

Both use the same routes - the response format is determined by the `Accept` header:
- `Accept: text/html` → Server-side rendered HTML
- `Accept: application/json` → JSON response

All communication with the registry core uses events, making it work locally or in distributed environments.

### Key Features

✅ **Browse All Plugins** - View all available plugins in the registry
✅ **Full-Text Search** - Search by name, tags, or description
✅ **Category Filtering** - Filter by service, observable, events, config
✅ **Language Filtering** - Filter by Node.js, C#, Go, Java, Python
✅ **Sort Options** - Sort by name, recent, or popularity
✅ **Plugin Details** - View events, documentation, installation instructions
✅ **Responsive Design** - Works on desktop, tablet, and mobile
✅ **Dark Theme** - Matches BSB documentation site styling

### Architecture

The UI plugin is part of the `@bsb/registry` package:

1. **service-bsb-registry** - Core registry with event handlers (database, auth, operations)
2. **service-bsb-registry-ui** (this plugin) - Web interface on port 3200

**Event-Driven Communication:**
- UI uses events to fetch data from core (not HTTP calls)
- Works locally with `events-default` or distributed with `events-rabbitmq`
- Server-side rendering with Handlebars templates
- Traditional web flow: GET request, fetch data via events, render HTML, return response

Both plugins can be deployed together (single service) or separately (distributed microservices).

---

## Installation

### Prerequisites

The Registry UI requires the Registry core to be configured:

- **service-bsb-registry** - Core registry with event handlers
- **events plugin** - Either `events-default` (local) or `events-rabbitmq` (distributed)

### Install the Plugin

```bash
npm install @bsb/registry
```

The UI plugin is included in the same package as the API plugin.

## Configuration

Add to your BSB `sec-config.yaml`:

```yaml
# Registry Web UI
service-bsb-registry-ui:
  port: 3200                    # UI server port
  host: 0.0.0.0                 # Listen address
  pageSize: 20                  # Plugins per page
```

### Full Configuration with Core Registry

```yaml
# Registry Core (Event-Driven)
service-bsb-registry:
  database:
    type: sqlite
    path: ./.temp/registry.db
  auth:
    tokensFile: ./.temp/api-tokens.json
    requireAuth: true

# Registry Web UI (Server-Side Rendered)
service-bsb-registry-ui:
  port: 3200
  host: 0.0.0.0
  pageSize: 20
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `port` | HTTP server port | `3200` |
| `host` | Bind address | `0.0.0.0` |
| `pageSize` | Plugins per page | `20` |

---

## Features

### Browse Plugins

- **Grid View**: Plugin cards with name, description, version, category
- **Stats Overview**: Total plugins, languages, downloads
- **Category Badges**: Visual indicators for service, observable, events, config
- **Language Tags**: Node.js, C#, Go, Java, Python support indicators

### Search & Filter

- **Full-Text Search**: Search across names, tags, and descriptions
- **Category Filter**: Quick filters for service, observable, events, config
- **Language Filter**: Filter by programming language
- **Sort Options**:
  - **Name**: Alphabetical order
  - **Recent**: Most recently updated
  - **Popular**: Most downloads

### Plugin Details

Click any plugin card to view:

- **Full Description**: Detailed plugin information
- **Event Schema**: Available events and their signatures
- **Installation**: Copy-paste installation commands
- **Documentation**: README, changelog, API reference
- **Metadata**: Version, category, tags, author, license
- **Links**: Homepage, repository, npm package

### Pagination

- **12 plugins per page** for optimal browsing
- **Smart pagination**: Shows first, last, and nearby pages
- **Scroll to top**: Automatically scrolls on page change

---

## Usage

### Start the UI

With both plugins configured, start your BSB service:

```bash
npm run dev
```

The UI will be available at **http://localhost:3200**

### How It Works

The UI uses server-side rendering with Handlebars templates:

1. User requests a page (e.g., GET /plugins)
2. UI server emits events to registry core (e.g., `registry.plugin.list`)
3. Core processes event and returns data
4. UI renders Handlebars template with data
5. HTML is sent to browser

This architecture works locally (events-default) or distributed (events-rabbitmq) without code changes.

---

## Deployment

### Local Development

```bash
# Start with minimal config
npm run dev
```

Access at http://localhost:3200

### Production Deployment

Deploy behind a reverse proxy:

```nginx
server {
    listen 443 ssl http2;
    server_name registry.bsbcode.dev;

    # API backend
    location /api/ {
        proxy_pass http://localhost:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Web UI
    location / {
        proxy_pass http://localhost:3200;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Separate Deployment

The UI can be deployed on a different server from the API:

```yaml
# UI Server configuration
service-bsb-registry-ui:
  port: 3200
  host: 0.0.0.0
  apiUrl: https://registry-api.example.com  # External API URL
  cors: true
```

---

## Styling

The Registry UI uses the same design system as the BSB documentation site:

### Color Scheme

- **Background**: `#1a1a1a` (dark)
- **Cards**: `#2a2a2a` (dark gray)
- **Primary**: `#FB8C00` (orange)
- **Service**: `#a200ff` (purple)
- **Config**: `#03A9F4` (blue)
- **Observable**: `#43A047` (green)

### Typography

- **Font**: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto
- **Monospace**: Monaco, Menlo, Consolas

### Components

- **Border Radius**: 12px for cards, 8px for inputs
- **Shadows**: Subtle shadows on hover for depth
- **Transitions**: 0.2s ease for smooth interactions

---

## Troubleshooting

### UI Not Loading

**Problem**: Blank page or connection refused

**Solution**:
1. Verify UI plugin is enabled in configuration
2. Check port 3200 is not in use
3. Ensure API is running on configured `apiUrl`

### No Plugins Showing

**Problem**: Empty plugin list

**Solution**:
1. Verify Registry API is running
2. Check `apiUrl` points to correct API endpoint
3. Verify API has plugins published
4. Check browser console for errors

### API Proxy Errors

**Problem**: 500 errors when searching or browsing

**Solution**:
1. Verify `apiUrl` in configuration is correct
2. Ensure API is accessible from UI server
3. Check CORS settings on both API and UI

### Styling Issues

**Problem**: UI looks broken or unstyled

**Solution**:
1. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Check browser console for CSS loading errors
3. Verify static assets were copied during build

---

## Development

### Build Assets

The UI uses static HTML/CSS/JS files:

```bash
npm run build
```

This copies assets from:
- `src/plugins/service-bsb-registry-ui/static/`

To:
- `lib/plugins/service-bsb-registry-ui/static/`

### Customization

To customize the UI:

1. Edit files in `src/plugins/service-bsb-registry-ui/static/`
2. Rebuild: `npm run build`
3. Restart the service

**Files:**
- `index.html` - Main HTML structure
- `css/style.css` - Styling (matches BSB docs theme)
- `js/app.js` - Client-side application logic

---

## See Also

- [BSB Registry API](/plugins/service/service-bsb-registry/) - API backend for the registry
- [BSB CLI Documentation](/guides/cli/) - Command-line plugin management
- [Publishing Plugins](/guides/publishing/) - How to publish your plugins
