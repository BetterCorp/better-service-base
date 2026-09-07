# Go and Rust implementation

Scope: complete Go, then Rust. Java remains metadata-only. Registry, Vault and syslog servers remain shared Node services accessed through generated clients.

BSB owns the executable and plugin lifecycle. Go modules and Rust crates register factories and static schemas. The build command generates a BSB host containing the selected packages; runtime configuration activates their registered plugins. Package installation/build is explicit and never triggered by a remote deployment profile.

Verification gates:

- [x] Go: fail-closed configuration, deterministic lifecycle, config/event schema validation and cleanup on startup failure.
- [x] Go: package build/export, Registry install/sync/publish and typesafe clients preserving portable AnyVali schemas.
- [x] Go: native config-default/env/Vault/Google, default/Rabbit events, native observability backends and examples.
- [x] Rust: BSB host, registered crate plugins, configuration and validation, package tooling and generated clients.
- [x] Rust: equivalent native runtime backends and examples.
- [x] Integration: all 20 directed RPC/trace/binary-stream language pairs and absent/crashed consumers; Registry/Vault language isolation against PostgreSQL.
- [x] Human/LLM documentation, Docker builds, package checks and CI/release workflow coverage.
- [x] Signed checkpoints and review fixes prepared for PR #109.
- [ ] Remote CI on the final Go/Rust commit (local checks passed).

Local verification covers Go/Rust runtime and generated-client compilation, seven native examples each, Rust crate packaging and linked-host export, non-root Go/Rust containers with CA roots, and .NET NuGet tool installation with external plugin loading. Review regressions cover TLS cache fail-closed behavior, event filters and fallback, compact Registry discovery, prerelease versions, language isolation, precise unsigned wire values, allowlisted overrides and collision-safe client installation.

Remote CI passed at 017b1b9; the final Go/Rust changes require another remote CI run after pushing. 1Password signing recovered on September 6. AnyVali SDKs now target 1.1.2; Go uses v0.0.0-20260907145251-9d398a873fdd. The C# SDK still limits uint64 validation to long.MaxValue; the wire conversion itself preserves UInt64 exactly. Rust release artifacts/images are configured, but crates.io publishing is not.
