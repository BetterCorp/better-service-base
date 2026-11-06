# Security review — November 2026

Reviewed `master` through `36194ca` across authentication, authorization, input
validation, plugin loading, secret handling, dependencies, containers, and CI for
Node/TypeScript, Python, Go, .NET, and Rust. The review also rechecked the Vault and
Registry authorization fixes from PRs #123–#128 and the initial supply-chain change
merged in PR #143.

## Actionable findings addressed

| Severity | Finding and evidence | Fix |
| --- | --- | --- |
| High | Runtime npm plugins and their transitive lifecycle hooks could execute while the Node container entrypoint still had root privileges (`nodejs/entrypoint.sh`, `nodejs/entrypoint.js`). A compromised plugin package therefore had a container-privilege escalation path during bootstrap. | Drop to `node:node` before bootstrap and watcher execution, restrict writable preparation to the primary install target, disable npm lifecycle scripts, and fail startup when any requested plugin cannot be installed. Publish prebuilt plugin artifacts. |
| High | Go vulnerability analysis identified reachable standard-library and HTTP/2 issues in the configured Go 1.26.1 toolchain and `golang.org/x/net` (`go.mod`, `.github/workflows/build.yml`). | Require Go 1.26.10 and `golang.org/x/net` v0.60.0. Generate clients before `govulncheck` so the audit covers the compiled package graph. |
| High | The Rust lockfile contained vulnerable `ctutils`, `quinn-proto`, `rustls`, `rustls-webpki`, and `webpki-root-certs` releases (`Cargo.lock`). | Refresh the lockfile to patched releases and run `cargo audit` in the dependency workflow. |
| Medium | GitHub Actions used mutable release tags in build, release, CodeQL, and audit workflows (`.github/workflows/*.yml`). A tag compromise or retarget could change trusted CI code without a repository diff. | Pin every third-party action to an immutable commit SHA and leave version comments for Dependabot maintenance. |
| Medium | Registry tokens accepted through `--token` can be exposed through process listings and shell history in every language CLI (`nodejs/src/cli.ts`, `python/src/bsb/cli.py`, `go/host/host.go`, `dotnet/BSB/Tooling/BsbCli.cs`, `rust/cli/src/tooling.rs`). | Keep the flag for compatibility but emit a warning and document `BSB_REGISTRY_TOKEN` as the preferred source. |
| Medium | Dependency checks were npm-only and did not consistently run on relevant changes (`.github/workflows/dependency-audit.yml`). This left Python, Go, .NET, and Rust advisories without an enforced review gate. | Add scheduled and path-triggered `pip-audit`, `govulncheck`, NuGet audit, and `cargo audit` jobs with read-only workflow permissions. |

## Previous-review comparison

- The Vault runtime-key relationship, organization-claim race, Registry Markdown
  XSS, unsafe metadata links, RabbitMQ delivery limits, and ambiguous service
  reference findings from PRs #123–#128 are fixed on `master`; no regression was
  found in this pass.
- PR #143 already merged the first plugin allowlist and integrity controls. This
  review closes the remaining container privilege boundary and CI/dependency-audit
  gaps that were left on its hardening branch.
- Dependabot PRs #117, #132, #145, and #148 were merged before this review was
  finalized. Their changes are included in the tested branch.

## Remaining risk and recommended follow-up

- **Medium:** pin release container base images by digest. The internal images are
  promoted by separate workflows, so implement digest publication and coordinated
  rollout before replacing tags in `*/Dockerfile` and `.github/workflows/release.yml`.
- **Medium:** add SBOM generation and image scanning before release promotion. The
  current workflow builds and publishes in the same release graph.
- **Medium:** `npm audit` still reports 18 moderate `glob`/`minimatch`
  findings through test, documentation, and static-serving toolchains. The
  available automatic remediation is breaking; validate the upstream major
  upgrades separately instead of forcing them into this hardening change.
- **Medium:** replace the unmaintained `rustls-pemfile` dependency and continue
  tracking RUSTSEC-2026-0386 for a patched Tokio release. These are explicitly
  allowed warnings in the Rust audit rather than silently ignored failures.
- **Low:** exact runtime plugin versions and verified integrity are not mandatory in
  watcher deployments. Decide an update/rollback policy before enforcing exact
  versions, because watcher deployments intentionally accept ranges today.

## Compatibility notes

- `BSB_PLUGIN_WATCHER=true` needs a writable primary plugin directory, so
  `BSB_SYNC_PERMISSIONS=true` is ignored in watcher mode. The watcher still runs as
  the unprivileged `node` user.
- Private npm registry configuration must be readable by `node` and selected with
  `NPM_CONFIG_USERCONFIG`; root's default `.npmrc` is intentionally not inherited.
- Runtime-installed plugins must publish prebuilt artifacts because install-time
  lifecycle scripts no longer execute.
- `--token` remains accepted, but callers should set `BSB_REGISTRY_TOKEN` outside
  the command instead of putting secrets in command arguments.

## Verification and unavailable checks

- Node 24 workspace lockfile validation, TypeScript build, and 181 Node base tests
  passed locally.
- After generating the Vault artifacts, 44 plugin security/regression tests passed;
  one live RabbitMQ test was skipped because no broker URL was configured.
- Go, .NET, Rust, Docker/container permission tests, `govulncheck`, NuGet audit, and
  `cargo audit` could not run in the review environment because those toolchains and
  Docker were unavailable. The pinned CI jobs are the authoritative checks for
  those paths.
