# BSB Python (Initial Port)

This directory contains a first Python implementation of the Node.js BSB runtime model:

- `ServiceBase` lifecycle: `init()` -> `run()` -> `dispose()`
- Config, events, and services controllers
- Dynamic plugin loading (built-in modules and optional `BSB_PLUGIN_DIR`)
- In-process default config and event plugins
- Service dependency ordering (`initBefore/initAfter/runBefore/runAfter`)
- AnyVali schema foundation for cross-platform validation/export
- AnyVali-backed config and event validation in the runtime
- Python CLI for schema export, registry publish, and registry client sync/install

## Quick start

```bash
cd python
python -m pip install -e .
bsb run
```

## Config file

Set `BSB_CONFIG_FILE` (default: `./sec-config.yaml`) and `BSB_PROFILE` (default: `default`).

Example config:

```yaml
default:
  observable: {}
  events: {}
  services:
    service-default0:
      plugin: service-default0
      enabled: true
      config:
        testa: 2
        testb: 3
```

## Test

```bash
cd python
python -m pip install -e .[dev]
pytest -q
```

## CLI

Build plugin artifacts for publishing:

```bash
cd python
bsb plugin build
```

Install a client schema from the registry and generate Python client code:

```bash
cd my-python-service
bsb client install myorg/service-demo
```

Regenerate local clients from downloaded schemas:

```bash
cd my-python-service
bsb client sync
```

Publish the current project to the registry:

```bash
cd python
BSB_REGISTRY_TOKEN=... bsb client publish
```

## AnyVali foundation

Python now exposes a small AnyVali-based schema module so new runtime and plugin work can use the same portable schema format as Node.js:

```python
from bsb.schema import av, object_schema, export_portable_schema

ConfigSchema = object_schema(
    {
        "host": av.optional(av.string()).default("localhost"),
        "port": av.optional(av.int32()).default(3200),
    }
)

document = export_portable_schema(ConfigSchema)
```

For event schemas, use the Python helpers that mirror the Node service-base shape:

```python
from bsb.schema import av, object_schema
from bsb.schema_events import create_event_schemas, create_returnable_event

EventSchemas = create_event_schemas(
    {
        "onReturnableEvents": {
            "calculate": create_returnable_event(
                object_schema({"a": av.int32(), "b": av.int32()}),
                av.int32(),
                "Add two integers together",
                default_timeout=5.0,
            )
        }
    }
)
```
