# Native Go examples

From this directory, run `go run ../../cmd/bsb plugin build`, then `./lib/bsb run` (Windows: `./lib/bsb.exe run`). BSB builds the linked host, loads `sec-config.json`, validates configurations and starts plugins. No application `main` is needed.

The package contains service-default0 through service-default4, service-benchmarkify and service-demo-todo. Their portable contracts match the Node/.NET/Python examples. `.bsb/schemas` contains checked-in contract snapshots; `go run ../../cmd/bsb client sync` regenerates `bsbclients` without a Registry connection. Real projects install schemas with `bsb client install`.

The defaults demonstrate typed calls, listener registration, broadcasts and startup ordering. Enable service-benchmarkify for bounded sequential RPC measurements. The todo example serves its UI and CRUD API on localhost:3000, uses validated event calls, saves snapshots atomically, and flushes on shutdown. Its file storage is for one process; use a database for shared writers. The HTTP demo has no authentication and binds localhost by default.

Run `go test ./examples/nativeplugins/...` from the Go root to exercise BSB startup and typed todo CRUD/persistence. Builtin Registry, Vault and syslog servers remain shared services; consume their generated clients instead of copying those servers.
