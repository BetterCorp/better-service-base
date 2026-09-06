# Native Python application plugins

This wheel contains `service-default0` through `service-default4`, `service-benchmarkify`, and `service-demo-todo`. BSB runs and discovers the wheel's `bsb.plugins` entry points. This package is not an application executable.

```sh
# Activate an application virtual environment first.
python -m pip install -e ../../
bsb plugin pack
bsb plugin install .bsb/packages/bsb_native_examples-1.0.0-py3-none-any.whl
bsb run
```

The supplied config binds the todo UI to `http://127.0.0.1:3000`. Default examples exercise generated clients and both RPC directions; benchmark is disabled by default. Enable it with a bounded `iterations` config.

Portable snapshots in `.bsb/schemas` come from Node examples; `scripts/export-example-contracts.mjs` refreshes both native languages. `bsb plugin build` regenerates `src/bsb_examples/clients` and exports schemas/manifest without constructing services. Keep every required todo config section (`storage`, `http`, `features`), even when using their field defaults.

Todo supports CRUD events and HTTP, schema validation, a 64 KiB HTTP body limit, periodic statistics, and atomic JSON saves including shutdown. The route controls item identity on PATCH. One process owns a storage file. Its standard-library HTTP server is a demonstration; use a production ASGI server and database for a production service.
