# Security hardening notes — November 2026

This change responds to the security review of commit
`d7676a1ac2974ed448f92b25d03f3eaea11aae93`.

## Addressed

- Node container plugin bootstrap and watcher processes now run as the unprivileged
  `node` user. Root is retained only for the small amount of startup directory and
  permission preparation that requires it.
- npm lifecycle scripts are disabled when runtime plugins and their dependencies are
  installed. Plugins must publish their runtime artifacts rather than build them in
  the service container.
- The npm lockfile was refreshed to remove the critical Handlebars findings and the
  high-severity gRPC findings reported by `npm audit`. The remaining audit findings
  are moderate `glob`/`minimatch` issues whose automatic fix requires a breaking
  dependency update.
- GitHub Actions are pinned to immutable commit SHAs. Dependabot remains responsible
  for proposing reviewed action updates.
- Scheduled and dependency-change audits now cover npm, Python, Go, Rust, and NuGet.
- The required Go patch release was raised from 1.26.1 to 1.26.10 and
  `golang.org/x/net` was raised to v0.60.0 after `govulncheck` identified
  reachable standard-library and HTTP/2 vulnerabilities.
- The Rust lockfile was refreshed to patched `ctutils`, `quinn-proto`, `rustls`,
  `rustls-webpki`, and `webpki-root-certs` releases identified by `cargo audit`.
- The cross-language CLIs warn when a registry token is supplied through `--token`,
  and Node help now demonstrates `BSB_REGISTRY_TOKEN` instead.

## Compatibility notes

- `BSB_PLUGIN_WATCHER=true` needs a writable plugin directory, so
  `BSB_SYNC_PERMISSIONS=true` is ignored in watcher mode. The watcher still runs as
  the unprivileged `node` user.
- Packages that require npm install-time compilation are no longer suitable as
  runtime-installed BSB plugins. Publish prebuilt artifacts instead.
- The core Node workspace uses TypeScript 6.x because TypeDoc 0.28 does not support
  TypeScript 7.x; this also keeps clean workspace builds reproducible.
- `--token` remains accepted for compatibility, but is deprecated because command
  arguments can be exposed through shell history and process inspection.

## Follow-up work

- Pin release container base images by digest. Internal base images are built and
  promoted by separate workflows, so digest rollout needs coordinated tag/digest
  publication rather than hard-coding a transient digest here.
- Add container image and SBOM scanning once the release workflow has a stable image
  artifact that can be scanned before promotion.
- Evaluate the breaking `glob` 14 update and its downstream `minimatch` upgrades in a
  separate compatibility change.
- Replace the unmaintained `rustls-pemfile` dependency and track
  RUSTSEC-2026-0386 for a patched Tokio release. `cargo audit` currently reports
  both as allowed warnings rather than fixable vulnerability failures.
- Consider enforcing exact runtime plugin versions and verified package integrity in
  production. Watcher deployments intentionally use version ranges today, so this
  requires an explicit update policy and rollback design.

