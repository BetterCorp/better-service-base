# config-default

`config-default` is the built-in configuration plugin for BSB.

It loads your deployment profile from YAML, resolves enabled plugins, and exposes typed plugin config at runtime.

## What It Does

- Reads `sec-config.yaml` (or `BSB_CONFIG_FILE`)
- Selects active profile using `BSB_PROFILE` (default: `default`)
- Resolves plugin definitions for:
  - `services`
  - `events`
  - `observable`
- Returns each plugin's `config` object to that plugin at startup

## Bootstrap Source Of Truth

`config-default` bootstraps from environment variables first.

It cannot rely on `sec-config.yaml` to configure itself, because it is the component responsible for loading that file.

Use:

- `BSB_PROFILE`
- `BSB_CONFIG_FILE`
- `BSB_CONFIG_PLUGIN` (when overriding)
- `BSB_CONFIG_PLUGIN_PACKAGE` (when overriding)

## Typical `sec-config.yaml` Shape

```yaml
default:
  observable:
    observable-default:
      plugin: observable-default
      enabled: true
      config: {}

  events:
    events-default:
      plugin: events-default
      enabled: true

  services:
    service-my-api:
      plugin: service-my-api
      package: "@org/my-api"
      enabled: true
      config:
        port: 3200
```

Note:

- You may include a `config.config-default` block for explicit metadata if desired.
- It is not the bootstrap source for `BSB_PROFILE` / `BSB_CONFIG_FILE`.

## Environment Variables

- `BSB_PROFILE`: active profile key in YAML (for example `default`, `production`)
- `BSB_CONFIG_FILE`: path to YAML file (default `./sec-config.yaml`)
- `BSB_CONFIG_PLUGIN`: optional override plugin name
- `BSB_CONFIG_PLUGIN_PACKAGE`: optional override package for config plugin

## Environment Values Inside YAML

`config-default` does **not** perform `${VAR}` or `${VAR:-default}` interpolation inside `sec-config.yaml`.

If you need environment-driven values in plugin config, use one of:

- A custom config plugin that resolves env placeholders before returning config
- Explicit static values in YAML

## When To Replace

Replace `config-default` if you need:

- Dynamic remote configuration
- Live config reload without process restart
- External secret backends
