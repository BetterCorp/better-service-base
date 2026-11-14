# Security review — November 2026

Reviewed `master` through `36194ca` across authentication, authorization, input
validation, plugin loading, secret handling, dependencies, containers, and CI for
Node/TypeScript, Python, Go, .NET, and Rust. The review also rechecked the Vault and
Registry authorization fixes from PRs #123–#128 and the initial supply-chain change
merged in PR #143.

## Reconciliation review — 9 November 2026

A fresh high-reasoning scan reviewed merged `master` at `087f1578`. The scan
completed with 14 validated findings, but its bundle-level schema validation
reported a warning; the digest-verified findings artifact remained readable and
was reconciled directly against the source.

This follow-up fixes the newly identified concrete issues:

- **Medium:** release tags were interpolated into publishing shell scripts without
  a strict grammar. The prepare job now rejects anything outside the supported
  SemVer form before exposing the value to credentialed jobs.
- **Medium:** Python `--source` installs mixed `--find-links` with ambient indexes.
  Explicit sources are now authoritative through `--no-index`, with regression
  coverage.
- **Medium:** the Node syslog exporter advertised TLS through a dependency that
  only implements UDP/TCP and also ignored the configured port. The port is now
  passed and TLS fails closed instead of silently using plaintext.
- **Medium:** the Node RabbitMQ receive-stream activity timer retained an expired
  handle and stopped rearming. The handle is cleared before the deadline is
  scheduled again.
- **Low:** custom Node Axiom endpoints could send bearer tokens over HTTP. Custom
  endpoints now require HTTPS.
- **Low:** Registry descriptions and related metadata could inject terminal
  controls into `bsb-client`; displayed remote fields now encode controls.
- **Low:** the default .NET observable allowed newline/terminal-control log
  forging; caller-controlled plugin names and interpolated messages are encoded.

Post-merge review found and fixed four edge cases before release:

- The release validator now implements SemVer core and numeric-prerelease
  leading-zero rules while retaining valid hyphens inside identifiers.
- Python wheelhouse installs ignore inherited pip configuration and environment
  sources, force resolution from local wheels, reject source distributions and
  direct-URL dependencies, and reinstall the selected distribution.
- Registry CLI output encodes every C0/C1 control, including newlines, in plugin
  display names and metadata.
- RabbitMQ rejects unmatched correlations without requeue, treats publish
  backpressure separately from failure, notifies timeout listeners independently
  of the broker, and contains detached-listener failures.

The scan also reconfirmed the design items documented below. The follow-up branch
now protects legacy Registry namespaces, validates every Registry publication
transport, bounds cross-language dead-letter storage, and couples Node stream
acknowledgement to consumer demand. Exact package lookup indexing and bounded
Vault audit retention remain open storage-capacity work.

## Follow-up review — 8 November 2026

The follow-up reviewed `master` through `ddc7bb4` and compared it with the 7 November
scan at `7b4b93e`. PR #156 fixed the manifest-controlled documentation escape and
the Node custom-origin token fallback. The remaining source-backed findings are
addressed by the follow-up change:

### Fresh independent scan reconciliation

A new high-reasoning repository scan of `229464b` completed on 8 November and
returned 17 validated source findings (one high, 13 medium, and three low). Its
bundle-level schema validation emitted a warning, but the complete findings
artifact was readable, digest-stable, and valid JSON. The findings were
independently checked against the source and reconciled as follows:

| Severity | Finding and evidence | Disposition / recommended fix |
| --- | --- | --- |
| High | Schema extraction retained executable pre-class statements and schema imports, then dynamically imported the generated module with build/CI authority (`nodejs/src/scripts/extract-schemas-from-source.ts`). | **Fixed in this change.** Validate generated schema modules with the TypeScript AST before import, use exact trusted import targets, recursively validate local imports and reachable helper bodies, validate config construction, reject prototype/constructor call chains and decorators, and cover direct/imported bypasses. |
| Medium | Vault shared authentication budgets were charged before subject isolation (`plugins/nodejs/config-vault/src/plugins/service-config-vault/vault.ts`). | **Fixed in this change.** Check the subject first and charge shared overload budgets only after failed verification. |
| Medium | Private Registry package images and `images.json` were under an unauthenticated static mount (`plugins/nodejs/bsb-registry/src/plugins/service-bsb-registry-ui/http-server.ts`). | **Fixed in this change.** Remove the image static mount, authorize mapped reads through package visibility, and reject any configured upload directory that canonically overlaps the remaining public static tree. |
| Medium | Relative `BSB_CONFIG_FILE` was reset to an ambient-working-directory path during init (`nodejs/src/plugins/config-default/index.ts`). | **Fixed in this change.** Resolve once against the application root; regression coverage uses a relative file while the process runs elsewhere. |
| Medium | Node Vault runtime responses used unbounded `Response.json()` (`plugins/nodejs/config-vault/src/plugins/config-vault/index.ts`). | **Fixed in this change.** Stream through a 4 MiB cap and fail hard on missing, oversized, or invalid bodies. |
| Medium | Plugin/package identifiers could traverse or symlink outside authorized roots before dynamic import (`nodejs/src/serviceBase/plugins.ts`). | **Fixed in this change.** Validate identifiers, canonicalize roots and candidates, and enforce containment; tests cover traversal and a symlink escape. |
| Medium | Registry CLI responses had neither cumulative byte caps nor total deadlines (`nodejs/src/scripts/bsb-client-cli.ts`). | **Fixed in this change.** Enforce an 8 MiB cap, destroy oversized responses, validate timeout configuration, and apply a total request deadline. |
| Medium | Publish-manifest image paths could escape the project and be uploaded with Registry credentials (`nodejs/src/scripts/bsb-client-cli.ts`). | **Fixed in this change.** Require a canonical regular file under the project root and cap it at 5 MiB. |
| Medium | Manifest plugin IDs could select schemas outside `lib/schemas` (`nodejs/src/scripts/bsb-client-cli.ts`). | **Fixed in this change.** Enforce a single safe plugin-ID segment plus canonical project containment and a 4 MiB schema cap. |
| Medium | Auth-disabled file storage can contain populated namespaces without organization records; enabling auth lets the first create-org user claim them (`plugins/nodejs/bsb-registry/src/plugins/service-bsb-registry/index.ts`, `db/file.ts`). | **Fixed in the follow-up branch.** Populated namespaces without ownership metadata cannot be claimed; an administrator must complete the documented migration. |
| Medium | Direct `registry.plugin.publish` event callers bypass the HTTP transport's schema-safety and aggregate-size validation (`plugins/nodejs/bsb-registry/src/plugins/service-bsb-registry/index.ts`). | **Fixed in the follow-up branch.** Shared core validation now applies structural, schema, count, depth, and aggregate-size limits to every transport. |
| Medium | Unknown RabbitMQ stream correlations were left unacknowledged and could exhaust prefetch (`plugins/nodejs/events-rabbitmq/.../emitStreamAndReceiveStream.ts`). | **Fixed in the post-merge follow-up.** Reject unmatched deliveries without requeue so they are settled through the configured dead-letter path. |
| Medium | Node RabbitMQ stream chunks are acknowledged even when `Readable.push()` reports backpressure (`plugins/nodejs/events-rabbitmq/.../emitStreamAndReceiveStream.ts`). | **Fixed in the follow-up branch.** Acknowledgement is deferred until `_read()` signals renewed demand; cleanup settles accepted buffers and each stream has a 256 MiB aggregate cap. |
| Medium | Node, Go, Python, Rust, and .NET transports configure a durable seven-day dead-letter queue without a count/byte ceiling. | **Fixed in the follow-up branch.** Every runtime declares 24-hour retention, 100,000-message and 256 MiB ceilings with oldest-message eviction; existing queues require the documented one-time recreation. |
| Low | Unknown/inactive Vault users skipped scrypt while active administrators executed it, exposing an email-existence timing signal (`plugins/nodejs/config-vault/src/plugins/service-config-vault/vault.ts`). | **Fixed in the 2026-11-10 follow-up.** Every admitted login now performs exactly one valid scrypt verification; unknown, inactive, and passwordless users use a fixed dummy record and remain ineligible even if its comparison matches. |
| Low | Fabricated runtime credentials append immutable audit rows; sustained traffic can consume audit capacity and trip the fail-closed control plane (`plugins/nodejs/config-vault/src/plugins/service-config-vault/store.ts`). | **Open capacity item.** Aggregate unknown-key failures, bound audit enqueueing, and partition/archive integrity-protected audit data. |
| Low | Public exact package lookup repeatedly scans and sorts the file registry (`plugins/nodejs/bsb-registry/src/plugins/service-bsb-registry-ui/http-server.ts`, `db/file.ts`). | **Open performance hardening.** Add an indexed exact-ID query and charge rate limits by internal work. |

| Severity | Finding and evidence | Remediation |
| --- | --- | --- |
| Medium | A blocked Vault subject continued incrementing the shared login/runtime/publisher attempt budget before its per-subject block was checked (`plugins/nodejs/config-vault/src/plugins/service-config-vault/vault.ts`). Repeating one blocked identity could deny unrelated credentials. | Check the subject block first, charge shared budgets only after a failed verification, preserve rotating-identity protection, and return HTTP 429 for runtime and publisher throttling. |
| Low | Node Registry consumers accumulated full remote bodies, and Vault Registry search had no application deadline (`nodejs/src/scripts/bsb-client-cli.ts`, `plugins/nodejs/config-vault/src/plugins/service-config-vault/http-server.ts`). | Enforce declared and streaming byte caps, abort on overflow, and apply a ten-second Vault search deadline. |
| Low | The Registry mounted the image directory, including `images.json`, as unauthenticated static content (`plugins/nodejs/bsb-registry/src/plugins/service-bsb-registry-ui/http-server.ts`). | Remove the static mount and serve mapped image files only after the normal package-read decision confirms at least one readable implementation. |
| Low | The unauthenticated todo demo defaulted and documented all-interface listeners (`plugins/nodejs/demo-todo-app/src/plugins/service-demo-todo/index.ts`, `http-server.ts`, and example configs). | Default to loopback, reject every non-loopback bind, disable CORS by default, and update all examples and documentation. |
| Low | .NET and Rust custom Registry targets inherited `BSB_REGISTRY_TOKEN` even when the selected origin differed (`dotnet/BSB/Tooling/RegistryClient.cs`, `dotnet/BSB/Tooling/BsbCli.cs`, `rust/cli/src/tooling.rs`). | Bind the environment credential to the configured Registry origin; require an explicit token for any different origin. |

Regression coverage now verifies private image authorization, demo listener
containment, and that blocked identities stop consuming the shared Vault budget.
The Registry response limits are also enforced for fixed-length and chunked
responses by the shared bounded reader.

Follow-up verification:

- Node 24 lockfile validation, TypeScript compilation, 201 base tests, and 47
  plugin/security regression tests passed. One live RabbitMQ test was skipped
  because no broker URL was configured.
- Source-schema extraction completed successfully across all 14 Node plugin
  workspaces after the build-time execution guard was enabled.
- Python 3.12 passed 65 tests. `pip-audit` reported no known vulnerability in
  resolved third-party dependencies; the two local editable packages are not
  published on PyPI and therefore cannot be matched by that advisory source.
- `npm audit --omit=dev` still reports six moderate `glob`/`minimatch` findings
  in Mocha/NYC/rimraf tooling. npm offers only a breaking forced remediation;
  this remains a separately tracked upgrade rather than an unsafe forced change.
- Go/govulncheck, .NET/NuGet audit, Rust/cargo audit, Docker builds, and container
  permission tests could not run locally because usable Go, .NET, Rust, and Docker
  toolchains were unavailable. The pinned CI jobs remain authoritative.

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
