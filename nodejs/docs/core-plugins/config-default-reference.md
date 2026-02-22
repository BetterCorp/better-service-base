# Config-Default Reference

This page covers the exact fields `config-default` reads and returns.

## Top-Level Profile Structure

```yaml
<profile-name>:
  config: {}
  observable: {}
  events: {}
  services: {}
```

## Plugin Definition Fields

Each plugin entry supports:

- `plugin`: plugin id, e.g. `service-my-api`
- `package`: npm package if external, e.g. `@org/my-api`
- `enabled`: `true|false`
- `version`: optional selector (`major.minor` or `major.minor.micro`)
- `config`: plugin-specific payload passed to plugin config validation

## Resolution Rules

- Service name in config is the mapped runtime name.
- `plugin` is the implementation id loaded from package/lib.
- If `enabled: false`, plugin definition can still be read but is not started.
- Missing profile key causes startup failure.

## Example With Versioned External Package

```yaml
default:
  services:
    service-registry:
      plugin: service-bsb-registry
      package: "@bsb/registry"
      version: "1.0"
      enabled: true
      config:
        database:
          type: file
          path: /mnt/temp/registry-data
```
