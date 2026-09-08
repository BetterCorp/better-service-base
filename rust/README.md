# Rust BSB host

Rust applications are plugin crates loaded by a BSB executable. BSB owns configuration, transport startup, service ordering and shutdown. Plugins register factories and static contracts; exporting schemas never constructs application services. Selected crates are linked at build time. Runtime profiles cannot download or execute packages.

Requires Rust 1.95 or later and a native C toolchain for TLS dependencies. The root Cargo workspace contains the SDK in `rust/`, CLI in `rust/cli`, builtin implementations in `plugins/rust/builtins`, and examples in `plugins/rust/native-examples`. `cargo test --workspace --locked` checks these packages and generates clients from shared portable contracts during compilation. The repository integration harness exercises all directed Node/.NET/Python/Go/Rust RPC, trace and binary-stream pairs against RabbitMQ.

## Build and run plugins

From the repository root, install the CLI with `cargo install --path rust/cli --locked`. The SDK contains reusable contracts, runtime and host interfaces; the CLI composes the separate builtin plugin crate. `Registry::new()` creates an empty registry; custom host composition registers defaults with `bsb_rust_builtins::register`. A consuming plugin crate depends only on the SDK:

```toml
[dependencies]
bsb = { package = "better-service-base", path = "../service-base/rust" }
```

Its library exports `pub fn register(registry: &mut bsb::host::Registry) -> bsb::Result<()>`. Register `Contract`, `Ordering` and factories with `registry.register`; services implement the async `Service` trait. `register_config`, `register_events` and `register_observable` support native extension backends. Factories receive validated options; observable factories also receive the application working directory. Register listeners in `init`; use `run` to start work and `shutdown` to release resources. Long-running tasks observe `ServiceContext.cancel`. Event calls receive the caller's `Observable` to preserve traces.

```json
{"rust":[{"id":"service-orders","crate":"orders_plugin"}]}
```

Save this as `bsb-plugin.json` beside the consuming `Cargo.toml`. `crate` identifies the current crate or a dependency alias; Cargo's hyphen/underscore spelling is accepted. Explicit and workspace-inherited dependencies are supported. Each selected crate registers once, even if it supplies several plugins.

Run `bsb plugin build` to generate `.bsb/host`, compile `lib/bsb` (`.exe` on Windows), and export `lib/schemas`. `CARGO_TARGET_DIR` is respected for build caching. Start **`lib/bsb run`**; application crates do not own startup. Build for the target OS/architecture. In a final Docker stage based on the Rust BSB runtime, copy this linked executable over `/usr/local/bin/bsb`; the runtime image deliberately contains no compiler. See [the seven working examples](../plugins/rust/native-examples/README.md).

## Configuration and Vault

`BSB_CONFIG_PLUGIN` selects `config-default` (default), `config-env`, `config-vault` or `config-vault-google`. File configuration reads `sec-config.json`, overridden by `BSB_CONFIG_FILE`; environment configuration uses `BSB_CONFIG_JSON`. `BSB_PROFILE` defaults to `default`. Profiles merge recursively, configuration is bounded to 4 MiB, and unknown enabled plugins fail startup. Enabled entries must target `rust`; disabled remote references may target other languages. Unique logical service names resolve to deployment aliases; clients targeting multiple instances must specify an alias.

Vault bootstrap settings use environment variables `vaultUrl`, `apiKeyId`, `apiSecret`, `timeoutMs` (5000), `staleAllowedHours` (24), optional `cacheDir`, and `allowInsecureHttp` (false). Google mode requires `googleAudience` and uses Google's native Application Default Credentials and ID-token library. Redirects do not receive credentials. Authentication, malformed responses, tampered caches and wrong-language profiles fail startup. Transient failures retry within 15 seconds before using a validated encrypted cache, if allowed. AES-GCM cache authentication binds the endpoint, key ID and Rust language. `BSB_CONFIG_OVERRIDES` only changes explicitly allowlisted config paths and never changes the cached server response.

## Events and generated clients

`events-default` provides in-process events and bounded streams. `events-rabbitmq` uses `platformKey`, `endpoints`, `credentials.username/password`, `uniqueId`, `prefetch` (10), and `fatalOnDisconnect` (true). Producer and consumer declare matching durable RPC/event queues, preserving requests sent before a listener starts. Replies are confirmed before acknowledging requests. Failed deliveries are requeued up to ten times; poison counts are process-local. With `fatalOnDisconnect=false`, consumers restore topology and publications reconnect. Active streams do not resume across disconnects.

```sh
bsb client info @org/service-orders --source-language nodejs
bsb client install @org/service-orders --source-language nodejs --version 1.2.3
bsb client sync
bsb client publish --org org
bsb client publish --target https://vault.example --token TOKEN
```

`BSB_REGISTRY_URL` and `BSB_REGISTRY_TOKEN` select the shared Registry. Ambiguous implementations require `--source-language`. Installation saves exact version/source identity and full AnyVali documents in `.bsb/schemas`, then generates `src/bsbclients`; add `pub mod bsbclients` to your library. Offline `sync` regenerates these clients. Publish builds the linked host and includes static contracts and documentation; `--target` publishes to private Vault. Registry, Vault and syslog servers remain shared Node services accessed through generated clients.

Generated clients preserve objects, integer widths, arrays, maps, string enums, recursive references and optional/nullable fields. Omitted or empty `required` arrays make object properties optional, and `unknownKeys: "allow"` or `"passthrough"` objects retain extra properties through serde round trips. `Optional<T>::Missing` differs from `Present(None)` for a nullable field. Union/intersection/tuple and heterogeneous literal shapes use `bsb::Value`, with full AnyVali validation at the boundary. `specific(id)` scopes an instance; `events()` exposes stream operations. Stream IDs are opaque, Rabbit timeout values are whole seconds, and binary chunks use the shared Node Buffer envelope. Native `AsyncRead` streams have bounded buffers and cancellation-aware reads. Consume receivers through EOF and propagate read errors.

## Observability

Builtins: `observable-default`, `observable-logging-file`, `observable-pino`, `observable-winston`, `observable-opentelemetry`, `observable-axiom`, `observable-zipkin`, `observable-graylog`, `observable-syslog`. Pino/Winston select native Rust formats. `Observable::span` closes on drop; `counter`, `gauge` and `histogram` return `Result<Metric>` and share cumulative state per plugin/name. Reusing a name requires the same instrument kind, description and unit; conflicting definitions return an error. For example, `obs.counter("requests", "Requests", "count")?.increment(1)?`. Counter values preserve integer precision. Histograms currently export count/sum and one aggregate bucket; use explicit buckets when distributions are needed.

Common options: `level`, `logs`, `metrics`, `traces`, `base`, `redact` (dot paths and `*`). Redaction precedes interpolation. Default logging also accepts `mode` (`production`, `production-debug`, `development`). File logging uses `path`; Pino/Winston use `filePath`, `prettyPrint`. Relative file paths resolve from the application working directory. Rotation uses `maxBytes` (10 MiB), `maxFiles` (7, zero retains all), `interval` (`none`, `hourly`, `daily`) and `compress` (true).

OTLP/HTTP options: `endpoint`, `serviceName`, `serviceVersion`, `headers`, `resourceAttributes`, `samplingRate`, `flushIntervalMs`, `maxBatchSize`. Axiom also uses `token`, `dataset`, `orgId`, and requires HTTPS unless `allowInsecureHttp` is enabled. Zipkin uses its v2 spans endpoint. Export queues hold at most 4096 entries of 64 KiB; overflow drops telemetry with a diagnostic. Queues are non-durable and shutdown flush is bounded to ten seconds.

Graylog supports GELF UDP/TCP/TLS/HTTP, bounded UDP chunks, `additionalFields` and `httpEndpoint`. Syslog supports RFC3164/5424, UDP/TCP/TLS, newline/octet-counting framing. Configure `host`, `port`, `protocol`, `hostname`, `appName`, and `facility`. TLS validates hostnames/certificate chains and supports `caCertificatePath`, `clientCertificatePath`, `clientKeyPath`; relative paths resolve from the application working directory.

Event backends evaluate filter in alias sort order; the first match handles an operation. Missing/null accepts all, an empty list accepts none. Filters support operation lists, operation-to-boolean/plugin-list maps, or {enabled, plugins} entries. BSB adds an unfiltered local fallback if needed. Put a catch-all alias after selective aliases; malformed filters fail startup.

## Hosted clients

`bsb client install https://service.example.com` discovers public contracts at `/.well-known/bsb` and generates a client in this language. Use `--plugin org/name` when multiple contracts are hosted; `--source-language` and `--version` select an implementation. Saved schemas support offline regeneration. See the [discovery format and hosting instructions](../docs/hosted-client-discovery.md). Calls still use the configured BSB events transport.
