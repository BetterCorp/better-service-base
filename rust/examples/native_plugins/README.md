# Native Rust plugin examples

This crate registers seven plugins with BSB: service-default0 through service-default4, service-benchmarkify, and service-demo-todo. Default services demonstrate event direction, typed cross-service calls, transformations and startup ordering. Benchmarkify measures native RPC calls. Todo supplies validated CRUD events, an HTTP UI and atomic JSON persistence.

From this directory:

```sh
cargo run --manifest-path ../../Cargo.toml --bin bsb -- client sync
cargo run --manifest-path ../../Cargo.toml --bin bsb -- plugin build
./lib/bsb run
```

Open http://127.0.0.1:3000. `sec-config.json` enables the default services and Todo, with benchmark disabled. Set `service-benchmarkify.enabled` to true to exercise it. Contracts are static snapshots in `.bsb/schemas`; generated clients live in `src/bsbclients`. Export does not run constructors or bind the HTTP port.

Todo stores `.temp/demo-todos.json`, limits body/storage size and item count, saves atomically and flushes on shutdown. The file has one process owner; use a database for multiple writers. This unauthenticated example binds to localhost by default. Add application authentication before exposing it publicly.

Run `cargo test` to exercise HTTP validation, CRUD, capacity limits and persistence. The repository Rust CI also builds the real linked BSB host and verifies its 22 exported native contracts.
