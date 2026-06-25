# config-env

`config-env` is the built-in configuration plugin for deployments that need the whole BSB runtime config supplied through environment.

It reads one JSON environment variable, selects a profile, and returns the same plugin definitions and plugin `config` objects as `config-default`.

## What It Does

- Reads `BSB_CONFIG_JSON`
- Selects active profile using `BSB_PROFILE` (default: `default`)
- Resolves plugin definitions for:
  - `services`
  - `events`
  - `observable`
- Returns each plugin's `config` object to that plugin at startup

## Activation

```sh
BSB_CONFIG_PLUGIN=config-env
BSB_PROFILE=default
BSB_CONFIG_JSON='{"default":{"observable":{},"events":{},"services":{"service-api":{"plugin":"service-api","enabled":true,"config":{"port":3200}}}}}'
```

`BSB_CONFIG_PLUGIN_PACKAGE` is not needed when using the built-in BSB package.

## JSON Shape

`BSB_CONFIG_JSON` uses the same profile shape as `sec-config.yaml`:

```json
{
  "default": {
    "observable": {
      "observable-default": {
        "plugin": "observable-default",
        "enabled": true,
        "config": {}
      }
    },
    "events": {
      "events-default": {
        "plugin": "events-default",
        "enabled": true
      }
    },
    "services": {
      "service-my-api": {
        "plugin": "service-my-api",
        "package": "@org/my-api",
        "enabled": true,
        "config": {
          "port": 3200
        }
      }
    }
  }
}
```

## Environment Variables

- `BSB_CONFIG_PLUGIN`: set to `config-env`
- `BSB_PROFILE`: active profile key in JSON (for example `default`, `production`)
- `BSB_CONFIG_JSON`: full BSB runtime config JSON object

## Notes

- `config-env` does not parse flat env paths.
- `config-env` does not coerce env values into nested config fields.
- Service, event, and observable plugin config still goes through each plugin's schema at startup.
- At least one service plugin must be enabled in the selected profile.
