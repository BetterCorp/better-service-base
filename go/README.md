# Go BSB host

Go applications are BSB plugins. The BSB executable owns configuration, observability, transport startup, service ordering and shutdown. Plugin packages register factories and static `bsb.PluginContract` metadata; export never invokes application constructors. Selected packages are linked into a BSB host at build time.

File/environment/Vault configuration, native Rabbit transport, runtime validation, package/client tooling and native observability are implemented. CI verifies all 12 directed RPC/trace/binary-stream pairs across Node, .NET, Python and Go, plus absent and crashed consumers. Seven native examples are included under `examples/nativeplugins`; Rust work remains tracked in [the implementation plan](../docs/native-go-rust-plan.md).

`go run ./cmd/bsb` starts the host. Set `BSB_CONFIG_PLUGIN` to `config-default` (default), `config-env`, `config-vault` or `config-vault-google`. File configuration reads `sec-config.json`; `BSB_CONFIG_FILE` overrides its path. Environment configuration reads `BSB_CONFIG_JSON`. `BSB_PROFILE` selects a profile (default `default`). Profiles merge recursively with defaults, enabled native entries must use language `go`, and disabled remote service references may use another language. An enabled package absent from the linked host fails startup.

Vault uses `vaultUrl`, `apiKeyId`, `apiSecret`, `timeoutMs` (5000), `staleAllowedHours` (24), optional `cacheDir`, and `allowInsecureHttp` (false). Google authentication also requires `googleAudience` and uses Application Default Credentials. HTTP redirects never receive credentials. Authentication, invalid responses and wrong-language profiles fail startup. Transient failures retry for up to 15 seconds; a validated encrypted cache may then be used within its permitted age. Cache contents are authenticated and bound to the endpoint, key ID and Go language. `BSB_CONFIG_OVERRIDES` only accepts paths allowed by the Vault profile and does not alter the cached response.

`events-rabbitmq` uses `platformKey`, `endpoints`, `credentials.username/password`, `uniqueId`, `prefetch` (10), and `fatalOnDisconnect` (true). Producers and consumers declare matching durable event/RPC queues. Replies are confirmed before request acknowledgement. Failed deliveries are requeued up to ten attempts; poison counts are process-local. With `fatalOnDisconnect=false`, consumers restore their topology and future publications reconnect; active streams do not resume. Stream IDs are opaque and timeout values are whole seconds. Binary chunks use the existing Node Buffer envelope with bounded receive buffering. Supply finite, responsive `io.Reader` sources; the standard interface cannot interrupt a reader blocked inside its own `Read` method.

`bsb.WithObservable(ctx, obs)` preserves the caller trace through nested client calls. Generated optional fields use `bsb.Optional[T]` and `json:",omitzero"` to distinguish omitted values from explicit nulls.

Run `go test ./...`. Real multi-language Rabbit tests run in the repository integration CI with a RabbitMQ service.

## Package builds and generated clients

A consuming Go module adds BSB as a dependency and lists its linked plugin packages in `bsb-plugin.json`:

```json
{"go":[{"id":"service-orders","package":"example.com/orders/plugin"}]}
```

Each package exports `Register(*bsb.PluginRegistry)` and registers factories plus static contracts. Run `go run github.com/bettercorp/service-base/go/cmd/bsb plugin build` from the consuming module. This writes `.bsb/host/main.go`, compiles `lib/bsb` (`.exe` on Windows), and exports `lib/schemas/*.json`. Start **that BSB executable** with `run`; application packages do not own startup. A final Docker stage can copy `lib/bsb` over `/usr/local/bin/bsb` in the BSB Go image. Build the executable for the image's OS/architecture.

```sh
bsb client info @org/service-orders --source-language nodejs
bsb client install @org/service-orders --source-language nodejs --version 1.2.3
bsb client sync
bsb client publish --org org
bsb client publish --target https://vault.example --token TOKEN
```

Set `BSB_REGISTRY_URL` and `BSB_REGISTRY_TOKEN` for the shared Registry. A source language is required when multiple implementations exist. Installation writes the exact schema and source identity into `.bsb/schemas`, then generates `bsbclients/*.go`; sync works offline. Publish builds the linked host, exports without constructing plugins and publishes each manifest entry. Registry publishing includes documentation from the contract's `Documentation` paths (or `README.md`); `--target` publishes to a private Vault.

Generated clients contain typed objects, integer widths, arrays, maps, string enums, recursive references, nullable pointers and optional fields. Union/intersection/tuple and heterogeneous literal shapes use `json.RawMessage` with the full AnyVali contract still checked at runtime. Constructors resolve unique deployment aliases; pass an explicit alias when multiple profiles reference one plugin. `Specific(id)` targets one instance. `Events()` exposes the scoped stream API. Generic JSON conversion preserves large integers.

## Native observability

The host links `observable-default`, `observable-logging-file`, `observable-pino`, `observable-winston`, `observable-opentelemetry`, `observable-axiom`, `observable-zipkin`, `observable-graylog` and `observable-syslog`. Pino/Winston names select equivalent native Go output; they do not load JavaScript.

Common options: `level`, `logs`, `metrics`, `traces`, `base`, `redact` (dot paths with `*`). Redaction precedes message interpolation. File logging uses `path`; Pino/Winston accept `filePath` and `prettyPrint`. Rotation uses `maxBytes` (10 MiB), `maxFiles` (7; zero retains all), `interval` (`none`, `hourly`, `daily`) and `compress` (true).

OTLP/HTTP uses `endpoint`, `serviceName`, `serviceVersion`, `headers`, `resourceAttributes`, `samplingRate`, `flushIntervalMs` and `maxBatchSize`. Axiom additionally uses `token`, `dataset`, `orgId`; HTTPS is required unless explicitly enabled for local tests. Zipkin uses its v2 spans endpoint. Remote queues hold at most 4096 entries of 64 KiB each; excess telemetry is dropped with a diagnostic. Shutdown flushes for up to ten seconds. Histograms export count/sum with one aggregate bucket; add explicit bucket tracking when distributions are required.

Graylog supports GELF over UDP/TCP/TLS/HTTP with bounded UDP chunking. Syslog supports RFC3164/5424 and newline/octet-counting TCP framing. Set `host`, `port`, `protocol`, `hostname`, and appropriate `facility`; TLS verifies certificates and supports `caCertificatePath`, `clientCertificatePath`, `clientKeyPath`. Graylog also accepts `httpEndpoint`, `additionalFields`, and `compress`.
