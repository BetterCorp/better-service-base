# .NET BSB host

BSB is the executable host. Application services are class-library plugins that reference BSB for their contracts; they do not start their own `ServiceBase` process.

The JSON boundary preserves signed and unsigned 64-bit integers without converting them to floating point, and generated clients map the portable generic `int` to C# `long`. Numeric literals from contract JSON use `long` or `ulong` for exact integral values, including decimal/exponent notation, and `JsonElement` when an integral value exceeds both ranges. Fractional values use `double`. Full-range `int64` and `uint64` values remain exact through AnyVali validation and generated clients.

```sh
dotnet publish BetterServiceBase/BetterServiceBase.csproj -c Release -o output
```

Run `dotnet /absolute/path/to/output/BetterServiceBase.dll` from the application's working directory. Configure services in `bsb-config.json` (or `BSB_CONFIG_FILE`) and place each published plugin at `plugins/<plugin-name>/<plugin-name>.dll`, alongside its private dependencies and `.deps.json`. BSB also searches its own `plugins/` directory for the bundled config, observable and events defaults. `BSB_PLUGIN_DIR` supports externally mounted, versioned packages.

`BSB_MODE` accepts `development` (the default), `production-debug`, or `production`; other values fail startup.

The `version` field requires a matching versioned plugin directory, including when `package` is omitted. Place pinned implementations under `.bsb/plugins/<package-or-plugin>/<version>/` or the equivalent `BSB_PLUGIN_DIR` layout. If that version cannot be resolved, startup fails; flat, application and bundled DLLs cannot satisfy an unverified pin. Omit `version` for unpinned local/flat loading.

Plugin projects should use `<EnableDynamicLoading>true</EnableDynamicLoading>`. Reference BSB with `Private="false"` and `ExcludeAssets="runtime"`; the loader shares the running host's BSB assembly so plugin contracts retain the same type identity. Private managed/native dependencies resolve through `AssemblyDependencyResolver`.

Plugins share the host's AnyVali 1.1.5 assembly as well as BSB. Declare a static `ConfigSchema` using `AnyVali.V` and a static `EventSchemas` using `BSBEventSchemas`. BSB validates config before construction and validates declared event inputs and outputs at runtime. `BSBTypes` remains available as a compatibility facade over AnyVali. Exported schemas preserve definitions, defaults and sensitive metadata.

Choose the configuration provider with `BSB_CONFIG_PLUGIN`. Bundled providers include `config-default` (JSON or YAML), `config-env` (`BSB_CONFIG_JSON`), `config-vault`, and `config-vault-google`. The file provider falls back to `sec-config.yaml` when `bsb-config.json` is absent. The file and environment providers accept Node's `default`/named-profile format as well as the original .NET root sections with optional `profiles`. `BSB_PROFILE` selects the profile; nested configuration merges recursively. At least one enabled service is required.

Vault uses the same environment names as Node: `vaultUrl`, `apiKeyId`, `apiSecret`, optional `timeoutMs`, `staleAllowedHours`, `cacheDir`, and `allowInsecureHttp`. Google authentication additionally requires `googleAudience`. Select `csharp` on the Vault deployment profile. Wrong-language responses fail startup. Transient failures are retried for up to 15 seconds, with an encrypted last-known-good fallback when enabled. Authentication failures, redirects, malformed responses and tampered/expired caches fail startup. Native cache files are separate from Node cache files. `BSB_CONFIG_OVERRIDES` only permits paths explicitly allowed by Vault and never changes the cached response.

The executable also provides native tooling:

`BetterCorp.BSB` is the SDK NuGet package. `BetterCorp.BSB.Cli` is a .NET tool that installs the `bsb` command and bundled native plugins. Build packages locally with `dotnet pack BSB/BSB.csproj -c Release -o packages` and `dotnet pack BetterServiceBase/BetterServiceBase.csproj -c Release -o packages`. Install the tool with `dotnet tool install BetterCorp.BSB.Cli --tool-path ./tools --add-source ./packages --version 9.1.11`. Release builds stamp both packages from the release version; the source version is not the published release version.

```sh
dotnet /path/to/BetterServiceBase.dll plugin build ./MyPlugin.csproj
dotnet /path/to/BetterServiceBase.dll plugin export ./lib/MyPlugin.dll
dotnet /path/to/BetterServiceBase.dll client install acme/service-orders --source-language nodejs --version 1.0.0
dotnet /path/to/BetterServiceBase.dll client generate
dotnet /path/to/BetterServiceBase.dll client publish --org acme
```

`plugin build` regenerates installed clients, publishes the class library, and exports static contracts without constructing the service. It writes `bsb-plugin.json` and `lib/schemas/`. Deploy the `lib` directory with its manifest and dependencies. Manifests allow plugin IDs to differ from assembly names. Declared `Metadata.Name` must match the requested plugin ID; the single-plugin legacy fallback applies only when metadata is absent. Multiple plugins in one assembly must each declare a unique `Metadata.Name`.

Syslog and GELF TLS logging require `clientCertificatePath` whenever `clientKeyPath` is configured. Invalid pairs fail before opening a connection.

Public `client publish` includes the local Markdown files listed in `Metadata.Documentation`, falling back to the project `README.md`. Missing or empty documentation fails locally before upload. Vault publishing (`--target`) does not require documentation.

`bsb plugin pack MyPlugin.csproj` builds the plugin and includes its manifest, schemas and dependency metadata in its NuGet package under `packages/`. `bsb plugin install Example.Worker --version 1.2.3` restores that exact NuGet version and its dependencies into `.bsb/plugins/Example.Worker/1.2.3`. An optional `--source` selects a NuGet feed. Installation uses a staging directory and moves the complete version into place atomically. Configure `package`, `version` and the logical `plugin` ID in the deployment profile. Build/pack/install require the .NET SDK; the runtime-only Docker image loads plugins prepared in an SDK build stage. The image runs as user `bsb` (UID 10001), from `/home/bsb`, with the host installed at `/opt/bsb`.

Installed schemas live in `.bsb/schemas`; C# clients live in `BsbClients`. Create a generated client in your service constructor with `new GeneratedClient(Events)`. Its methods accept `IObservable` and typed request values. Objects, enums, arrays, records and numeric types get native C# types; structural unions, intersections and tuples use `JsonElement`, validated against the full AnyVali schema. No handwritten shared-service client packages are required. Registry versions use strict SemVer, including leading-zero rules for core and numeric prerelease identifiers. Set `BSB_REGISTRY_URL` and `BSB_REGISTRY_TOKEN` for another registry. Publishing directly to Vault uses `--target URL --plugin ID --token TOKEN`.

Generated optional properties use `OptionalValue<T>`: leaving a property unset omits it from JSON; assigning a value marks it present. Use `new OptionalValue<string?>(null)` for an explicit nullable value. Read `IsSet` before `Value`. Generated event and RPC clients also expose `Specific(serverId, ...)` variants; the wire suffix matches Node's server-specific routing.

`events-default` routes within the process, scoped by plugin alias and event name. `events-rabbitmq` uses the existing Node BSB 9 queue names, envelopes, trace context and RPC correlations. Configure `platformKey`, `endpoints`, `credentials`, `prefetch`, `uniqueId`, and `fatalOnDisconnect`. `uniqueId` must not contain `||`. Received stream chunks are limited to 1 MiB of bytes, including UTF-8 encoded text. The startup timeout budget accounts for all endpoints on both publishing and receiving connections. Producers declare durable fire/RPC queues even without listeners. RPC handlers must tolerate duplicate requests: a reply is confirmed before the request is acknowledged, and transport failures cause redelivery. Poison deliveries move to the shared dead-letter queue after ten attempts. `fatalOnDisconnect=false` enables native connection/topology recovery; otherwise a disconnect faults the host so its supervisor can restart it.

Distributed streams use receiver registration, not the legacy local-only stream pair:

```csharp
var id = await Events.ReceiveStream("download", obs, async (span, error, stream) => {
    if (error is not null) throw error;
    using var output = File.Create("download.bin");
    await stream!.CopyToAsync(output);
});
// Pass id to the producer through a typed event or RPC, then on the producer:
await Events.SendStream("download", obs, id, inputStream);
```

The receiver ID is opaque and single-use. The sender retains ownership of its input stream. Consume the receiver stream through EOF; early completion aborts the transfer. Registration waits up to 30 seconds for the sender; the optional timeout controls inactivity after connection. Native streams transfer bytes and support Node Buffer JSON envelopes.

Returnable event defaults and calls accept fractional seconds and require a finite value greater than zero and no more than 86,400 seconds.

Native logging includes `observable-default`, `observable-logging-file`, `observable-pino`, and `observable-winston`. Pino/Winston identities select native equivalents; JavaScript transport modules and Node-specific option objects do not run in .NET. Both equivalents support `level`, `prettyPrint`, `base`, dotted `redact` paths (including `*` across objects/arrays), and an optional `filePath`. Pino uses numeric log levels; Winston uses named levels. Redaction applies to console and file output.

The file plugin uses `path` (default `logs/application.log`), `level`, `redact`, and `prettyPrint`. Its rotation options, also available for console plugins' optional files, are `maxBytes` (10485760), `maxFiles` (7 archives; 0 means unlimited), `interval` (`daily`, `hourly`, or `none`), and `compress` (true). Rotation preserves whole entries, so a single entry may exceed the byte threshold. Archives use a `.bsb-` suffix and optional gzip compression. Human-readable file output can span multiple lines; the default is one JSON object per line.

Completed spans include parent IDs, duration, attributes and errors. Transport listeners continue incoming Node traces. Linux SIGTERM and console cancellation initiate host shutdown; plugins dispose in reverse order even when another plugin's cleanup fails. RabbitMQ disposal cancels active stream receivers and waits up to five seconds for their handlers before closing channels and connections. Handlers should finish promptly on cancellation; later publishes are rejected.

Native remote exporters are bundled:

| Plugin | Transport and main options |
| --- | --- |
| `observable-opentelemetry` | OTLP HTTP JSON; `endpoint` defaults to `http://localhost:4318`, with `/v1/logs`, `/v1/metrics`, `/v1/traces` appended. |
| `observable-axiom` | Required sensitive `token`; `dataset`, optional `orgId`; default `https://api.axiom.co`. Logs/metrics use dataset ingestion; traces use OTLP. HTTP requires explicit `allowInsecureHttp`. |
| `observable-zipkin` | Zipkin v2 traces; `endpoint` defaults to `http://localhost:9411/api/v2/spans`. |
| `observable-graylog` | GELF UDP/TCP/TLS/HTTP; `host`, `port` (12201), `protocol`, `facility`, `additionalFields`; UDP `compress` defaults true. HTTP supports `httpEndpoint` and sensitive `headers`. |
| `observable-syslog` | RFC 5424 or 3164; `host`, `port` (514), `protocol` (`udp`, `tcp`, `tls`), numeric `facility` (16), `hostname`, `appName`, `rfc`. TCP `framing` can be `newline` or `octet-counting`; TLS always counts octets. |

OTLP/Axiom/Zipkin share `serviceName`, `serviceVersion`, `headers`, `resourceAttributes`, `samplingRate` (0–1), `flushIntervalMs` (5000), and `maxBatchSize` (512). OTLP/Axiom can disable individual `logs`, `metrics`, or `traces`. Metrics use cumulative counters and histograms, with separate plugin scopes. Custom native observable plugins must accept `pluginName` as the first argument to metric recording methods.

Graylog/syslog share `level`, `redact`, `flushIntervalMs` (1000), and TLS PEM options `caCertificatePath`, `clientCertificatePath`, `clientKeyPath`. Paths resolve from the application directory. TLS validates the peer name and certificate chain; supplying a CA replaces the system trust roots. It does not disable verification.

Structured log templates interpolate metadata after redaction. HTTP telemetry exporters accept dotted `redact` paths for logs and completed spans, for example `["meta.token", "attributes.token", "error"]`. Redaction runs before enqueueing and formatting OTLP, Axiom and Zipkin spans, including wildcard paths such as `attributes.users.*.secret`, without changing the span shared with other exporters.

Remote exporters buffer up to 4096 entries and report overflow/export failures to stderr. They flush at intervals and drain on shutdown with a ten-second deadline. HTTP never follows redirects, retries transient failures up to three attempts, and respects `Retry-After`; authentication failures and partial acknowledgements are not retried. UDP is best effort. Failed TCP batches are reported and the next batch reconnects. These buffers are not durable audit storage.

Lifecycle `InitBeforePlugins`, `InitAfterPlugins`, `RunBeforePlugins` and `RunAfterPlugins` accept profile aliases or logical plugin names. Explicit aliases take precedence; logical names match all configured instances. Missing optional peers are ignored; dependency cycles, including self-dependencies, fail startup. Failed `Init` and `Run` calls end their telemetry spans with the exception recorded.

The runtime remains an incomplete port, not full Node.js feature parity. The host smoke test verifies external discovery, aliases, configuration, shared contract identity, event wiring, metadata and lifecycle:

```sh
dotnet run --project tests/SmokeTests -c Release -- output tests/TestPlugin/bin/Release/net10.0
dotnet run --project tests/RuntimeTests
```

## Hosted clients

`bsb client install https://service.example.com` discovers public contracts at `/.well-known/bsb` and generates a client in this language. Use `--plugin org/name` when multiple contracts are hosted; `--source-language` and `--version` select an implementation. Saved schemas support offline regeneration. See the [discovery format and hosting instructions](../docs/hosted-client-discovery.md). Calls still use the configured BSB events transport.

HTTP telemetry applies configured `Redact` paths to metric records before queueing, including paths such as `labels.token`, as well as logs and spans.
