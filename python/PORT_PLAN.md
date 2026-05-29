# BSB Multi-Language Port Plan

## Node.js Review Summary

- Core boot pipeline is clear and stable: config -> observable -> events -> services.
- Service dependency ordering is based on before/after lists and mapped aliases.
- Plugin loading supports local, build output, external plugin dir, and package sources.
- Config plugin is the source of truth for enabled plugins and per-plugin config.
- Events API provides four patterns: broadcast, fire-and-forget, request/response, stream.

## Target Architecture (Common Across Python, Go, .NET)

- `ServiceBase`: lifecycle orchestration and shutdown behavior.
- Controllers:
  - `ConfigController`
  - `ObservableController`
  - `EventsController`
  - `ServicesController`
- Plugin contracts:
  - `ConfigPlugin`
  - `EventsPlugin`
  - `ObservablePlugin`
  - `ServicePlugin`
- Built-in defaults:
  - `config-default`
  - `events-default`
  - one sample service plugin

## Python Status (This Commit)

- Implemented controllers and `ServiceBase` orchestration.
- Implemented dynamic plugin loader with built-in and `BSB_PLUGIN_DIR` fallback.
- Implemented `config-default` and `events-default` plugins.
- Implemented sample `service-default0` plugin.
- Added runnable entrypoint and basic tests.

## Go Plan

- Package layout:
  - `go/bsb/runtime/*` controllers and `ServiceBase`
  - `go/bsb/plugins/default/*`
  - `go/cmd/bsb/main.go`
- Use interfaces for plugin contracts and explicit registration.
- Prefer deterministic dependency ordering with topological sorting.
- Use context-aware logging (`context.Context`) and structured logs.

## .NET (C#) Plan

- Project layout:
  - `dotnet/src/Bsb.Runtime/*` controllers and `ServiceBase`
  - `dotnet/src/Bsb.Plugins.Default/*`
  - `dotnet/src/Bsb.Cli/*`
- Use dependency injection + hosted service lifecycle (`IHostedService`).
- Plugin contracts via interfaces and optional reflection-based discovery.
- Strong options binding for config and validation.

## Next Python Steps

- Add `observable-default` plugin integration.
- Add stream event API parity (`emitStreamAndReceiveStream`).
- Add schema export and client generation hooks.
- Add plugin CLI tooling to align with Node scripts.
