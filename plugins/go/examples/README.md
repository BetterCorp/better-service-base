# Native Go examples

From this directory, run `go run ../../../go/cmd/bsb plugin build`, then `./lib/bsb run` (Windows: `./lib/bsb.exe run`). BSB generates clients, builds the linked host, loads `sec-config.json`, validates configurations and starts plugins. No application `main` is needed.

The package contains service-default0 through service-default4, service-benchmarkify and service-demo-todo. Their portable contracts match the Node/.NET/Python examples. The build runs `go generate`, which stages the versioned inputs from `plugins/contracts/examples` into ignored `.bsb/schemas` and generates ignored `bsbclients`. Real projects install schemas with `bsb client install`; `bsb plugin build` regenerates installed clients before compilation. Normal Go commands do not run generators automatically, so run `go generate` first when using `go build` or `go test` directly.

The defaults demonstrate typed calls, listener registration, broadcasts and startup ordering. Enable service-benchmarkify for bounded sequential RPC measurements. The todo example serves its UI and CRUD API on localhost:3000, uses validated event calls, saves snapshots atomically, and flushes on shutdown. Its file storage is for one process; use a database for shared writers. The HTTP demo has no authentication and binds localhost by default.

Run `go generate ./plugins/go/examples` then `go test ./plugins/go/examples/...` from the repository root to exercise BSB startup and typed todo CRUD/persistence. Registry, Vault and syslog servers remain shared services; consume their generated clients instead of copying those servers.
