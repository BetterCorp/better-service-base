# Go and Rust implementation

Scope: complete Go, then Rust. Java remains metadata-only. Registry, Vault and syslog servers remain shared Node services accessed through generated clients.

BSB owns the executable and plugin lifecycle. Go modules and Rust crates register factories and static schemas. The build command generates a BSB host containing the selected packages; runtime configuration activates their registered plugins. Package installation/build is explicit and never triggered by a remote deployment profile.

Verification gates:

- [ ] Go: fail-closed configuration, deterministic lifecycle, config/event schema validation and cleanup on startup failure.
- [ ] Go: package build/export, Registry install/sync/publish and typesafe clients preserving portable AnyVali schemas.
- [ ] Go: native config-default/env/Vault/Google, default/Rabbit events, native observability backends and examples.
- [ ] Rust: BSB host, registered crate plugins, configuration and validation, package tooling and generated clients.
- [ ] Rust: equivalent native runtime backends and examples.
- [ ] Integration: all directed RPC/trace/binary-stream language pairs and absent/crashed consumers; Registry/Vault language isolation.
- [ ] Human/LLM documentation, Docker and CI checks; signed commits and PR updates.

Current baseline: Node/.NET/Python integration and all Docker builds pass on PR #109. Go has a partial runtime; Rust is a placeholder. AnyVali native work targets release v1.1.1 (commit b2b40cbda37c32ae35235bfc044fb368316c28b4); SDK package versions may differ from the repository release.
