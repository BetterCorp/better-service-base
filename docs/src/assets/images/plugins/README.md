# Plugin Images Directory

This directory contains logos/images for BSB plugins displayed in the Plugin Marketplace.

## Image Guidelines

- **Format**: PNG or SVG preferred
- **Size**: Recommend 400x300px or similar aspect ratio
- **Background**: Transparent or use BSB color scheme
- **Naming**: Use the plugin package name (e.g., `bsb-events-rabbitmq.png`)

## Adding Plugin Images

### For Internal Plugins (in this repo)
1. Place the image in the plugin's root directory
2. Copy it to this directory: `docs/src/assets/images/plugins/`
3. Update the plugin entry in `docs/src/assets/data/plugins-registry.json`
4. Set the `image` field to: `/assets/images/plugins/your-image.png`

### For External Plugins
External plugin images can be:
- Hosted in the plugin's own repository
- Referenced via direct URL in the registry
- Submitted to this directory via PR

## Registry Configuration

Update `/assets/data/plugins-registry.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "image": "/assets/images/plugins/my-plugin.png",
  // ... other fields
}
```

If no image is provided, the marketplace will display a category-based placeholder icon.

## Current Images

- `bsb-events-rabbitmq.png` - RabbitMQ Events Plugin
- `bsb-rsyslog-server.png` - Syslog Server & Client Plugin

## Build Process

Images in this directory are automatically included in the Vite build and copied to `dist/assets/images/plugins/`.
