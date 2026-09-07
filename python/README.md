# BSB Python

BSB is the executable host. Your application is a Python plugin distribution loaded by BSB; installing BSB as a dependency does not start it. Python 3.11+ and AnyVali 1.1.2 are required.

## Run an application

```sh
python -m venv .venv
# Activate .venv using your shell's activation script.
python -m pip install -e /path/to/service-base/python -e /path/to/service-base/plugins/python/builtins
bsb plugin install my-bsb-plugins --version 1.2.3
bsb run
```

Use `bsb-config.json`, `sec-config.yaml`, or `sec-config.json` in the application directory, or set `BSB_CONFIG_FILE`. Select a profile with `BSB_PROFILE` (default `default`). JSON/YAML may contain root sections and `profiles`, or `default` and named profile sections. Named profiles deeply merge the defaults.

```json
{
  "language": "python",
  "observable": { "observable-default": {} },
  "events": { "events-default": {} },
  "services": {
    "worker": { "plugin": "service-worker", "package": "my-bsb-plugins", "version": "1.2.3", "config": {} },
    "registry": { "plugin": "service-bsb-registry", "language": "nodejs", "enabled": false }
  }
}
```

Enabled plugins must target Python. Disabled services remain available as remote routing references. Event filters use Node's operation names, such as `emitEventAndReturn`, with booleans, plugin alias lists, or `{ "enabled": true, "plugins": ["registry"] }` values. Configure Rabbit to reach services in other hosts.

Initialization runs config → observability → events → services. Lifecycle ordering uses `init_before_plugins`, `init_after_plugins`, `run_before_plugins`, and `run_after_plugins`; explicit aliases take precedence, and logical names match all configured instances. Cycles fail. Shutdown awaits reverse service cleanup, transport cleanup, exporter draining, then config cleanup. `bsb run` stays alive until SIGINT/SIGTERM or fatal transport failure.

## Native application packages

Declare entry points in your application's `pyproject.toml`:

```toml
[project.entry-points."bsb.plugins"]
service-worker = "my_plugins.worker:Plugin"

[tool.bsb]
clients-package = "my_plugins.clients"
```

Export a `Plugin` subclass of `BSBService` and a `Config` class with `metadata` and `validation_schema`. Declare `EventSchemas` on the service class. Create generated clients in the service constructor; register listeners in `init`, before services run. `plugin build` imports module definitions to export schemas but never constructs or starts application plugins. Keep module import side effects out of application code.

```sh
bsb plugin build   # regenerate clients; export lib/schemas and bsb-plugin.json
bsb plugin pack    # build a standard wheel with pip/setuptools
bsb plugin install .bsb/packages/my_plugins-1.2.3-py3-none-any.whl
```

BSB uses installed distribution entry points and pip's dependency resolver. Each virtual environment has one version of a distribution; conflicting versions require separate hosts/environments. An exact configured version must match the installed version. Local `bsb-plugin.json` manifests and `BSB_PLUGIN_DIR` support development sources; paths cannot escape their manifest directory. Package names, logical plugin IDs and Python module names are separate identities.

Exact Registry versions can include prerelease/build suffixes. For wheels, use [PEP 440-compatible versions](https://packaging.pypa.io/en/stable/version.html): `1.2.3-beta.1` in a profile matches pip's normalized `1.2.3b1`. BSB uses `packaging` for this comparison and installation; Registry identities retain their original version strings.

See [the native examples](../plugins/python/examples/README.md) for seven runnable plugins and a wheel installation example.

## Generated clients across languages

```sh
bsb client install myorg/service-worker --source-language nodejs --version 1.2.3
bsb client sync
bsb client info myorg/service-worker --source-language python
```

Registry source language and generated output language are independent. A sole accessible implementation is selected automatically; multiple implementations require `--source-language`. Snapshots live in `.bsb/schemas/org~name~language.json`. Generated Python modules default to `src/bsb_clients` (or `bsb_clients` without a `src` layout). Set `tool.bsb.clients-package` for a reusable plugin distribution to avoid package name collisions. Legacy `src/.bsb/schemas` is still read; duplicate normalized client names fail.

Clients carry complete AnyVali schemas for runtime validation and generate TypedDict, NotRequired, Literal, union, list, dictionary and tuple types. An omitted optional field remains omitted; nullable fields accept `None`. Use mypy or another type checker for caller checks. Numeric bounds and string formats are runtime constraints. All six event directions are supported, with `obs=` to preserve trace context and `server_id=` for a specific server. Registry/Vault/syslog server implementations stay on Node; install their generated clients instead of writing native service-specific clients.

Use `bsb.schema.object_schema` to infer optional object properties. When using `av.object_` directly, provide its `required` list explicitly: the Python SDK otherwise marks every field required. Imported native defaults, definitions, metadata and constraints are preserved. Object sections themselves still need to be present unless the schema gives that object a default.

Registry settings: `BSB_REGISTRY_URL`, `BSB_REGISTRY_TOKEN`, and explicit `BSB_REGISTRY_ALLOW_INSECURE_HTTP=true` for local HTTP. Requests have bounded responses/timeouts and never forward credentials through redirects.

```sh
bsb client publish                                  # BSB_REGISTRY_TOKEN
bsb client publish --target https://vault.example --plugin service-worker --org myorg --token TOKEN
```

`--target` publishes to Vault's `/api/plugins/publish`; omit it to publish to the registry. Vault publisher credentials are specific to the implementation language and identity. Prefer environment token settings to command arguments on shared machines.

## Configuration plugins

Select `BSB_CONFIG_PLUGIN=config-default|config-env|config-vault|config-vault-google`. `config-env` reads `BSB_CONFIG_JSON`. An external provider can set `BSB_CONFIG_PLUGIN_PACKAGE`.

Vault uses lower camel case environment settings: `vaultUrl`, `apiKeyId`, `apiSecret`, `timeoutMs` (5000), `staleAllowedHours` (24), optional `cacheDir`, and `allowInsecureHttp` (false). Google additionally requires `googleAudience`, obtains an ID token through Google application default identity, and sends `X-Serverless-Authorization` alongside Vault credentials. Rejected identity refreshes once.

Vault responses must target `python`. Wrong language, invalid config, authentication errors, redirects and TLS validation errors fail startup. Only transient failures permit encrypted cached config within the stale window. AES-GCM/HKDF cache files bind origin, key ID and language; changed secrets or tampering fail authentication. Cache paths are runtime-specific. `BSB_CONFIG_OVERRIDES` accepts only returned `envOverridePaths`, applies in memory and never changes the encrypted baseline.

## Rabbit and streams

`events-rabbitmq` uses native aio-pika with Node BSB 9 queue names and `{trace:{t,s},args:[payload]}` envelopes. Options: `endpoints`, `credentials.username/password`, `platformKey`, `uniqueId`, `prefetch` (10), and `fatalOnDisconnect` (true). Disabling fatal disconnect enables the client's topology recovery. Endpoints must use AMQP/AMQPS and the same virtual host; initial connections try them in order, and subsequent recovery uses the selected endpoint.

Producers declare durable fire/RPC queues so absent/crashed listeners do not lose queued messages. Existing protocol TTLs remain: fire queues one hour, RPC queues one minute, per-request expiration based on timeout. Replies are confirmed before acknowledging requests. Failed publishes requeue the request. Handlers must tolerate duplicate execution. Ten failures in a running consumer dead-letter a poison message; retry counts are process-local and bounded to 10,000 tracked messages.

Register streams with `await events.receive_stream(event, handler, timeout_seconds=5)`, pass the returned opaque ID to `send_stream`, and consume the receiver through EOF. Timeouts use whole seconds for cross-language IDs. Queues bound buffered chunks, and senders retain ownership of the source. Synchronous sources must provide a prompt, thread-safe `close()` that unblocks `read`; BSB calls it when an in-flight read is cancelled and rejects sources without it. Distributed streams are transient and fail on interrupted transfers; they do not provide durable resume.

## Observability plugins

| Plugin | Native behavior |
| --- | --- |
| observable-default | Structured JSON stdout |
| observable-logging-file | File logs; size/hour/day rotation, gzip, retention |
| observable-pino | JSON console with numeric levels; optional file |
| observable-winston | JSON/pretty console; optional file |
| observable-opentelemetry | OTLP HTTP JSON logs, metrics and traces |
| observable-axiom | Dataset event ingestion and OTLP traces |
| observable-zipkin | Zipkin v2 traces |
| observable-graylog | GELF UDP/TCP/TLS/HTTP |
| observable-syslog | RFC 5424/3164 UDP/TCP/TLS |

These use native configuration schemas; JavaScript Pino/Winston transports are not loaded. File options: `path` (file plugin) or `filePath`, `level`, `maxBytes` (10 MiB), `maxFiles` (7; zero retains all archives), `interval` (`none|hourly|daily`), `compress`, and dotted/wildcard `redact` paths such as `meta.users.*.token`. Console equivalents also accept `base` and `prettyPrint`.

HTTP exporters accept `endpoint`, `headers`, `serviceName`, `serviceVersion`, `resourceAttributes`, `flushIntervalMs`, `maxBatchSize`, `samplingRate`, and signal booleans. Axiom requires `token` and supports `dataset`, `orgId`, and explicit `allowInsecureHttp`. Queue capacity is 4096 entries; overflow/export errors report to stderr. Shutdown attempts a ten-second drain. Buffers are not durable. Partial acknowledgements and authentication errors are not retried. Counters/gauges/histograms retain per-plugin cumulative series; each instrument caps distinct label sets at 10,000.

Network loggers accept `host`, `port`, `protocol`, `level`, `redact`, and optional `caCertificatePath`, `clientCertificatePath`, `clientKeyPath`. TLS always checks both trust and hostname. Syslog adds `facility`, `hostname`, `appName`, `rfc`, `framing`. GELF adds `facility`, `compress`, `httpEndpoint`, `headers`, `additionalFields`.

## Build and verification

```sh
python -m pip install -e '.[dev]' -e ../plugins/python/builtins
python -m pytest tests -q
```

Tests cover actual generated client type checking, plugin lifecycles, Vault/registry HTTP boundaries, encryption, simulated AMQP delivery and streams, exporter payloads, real UDP/TLS, and example HTTP/persistence. Real multi-language Rabbit and PostgreSQL migration integration remain separate validation requirements. Docker builds install BSB and `bsb-python-builtins` in `/opt/bsb`; application plugins belong in that environment during a derivative image's build stage. Runtime containers run as `bsb` from `/home/bsb/app`.

## Hosted clients

`bsb client install https://service.example.com` discovers public contracts at `/.well-known/bsb` and generates a client in this language. Use `--plugin org/name` when multiple contracts are hosted; `--source-language` and `--version` select an implementation. Saved schemas support offline regeneration. See the [discovery format and hosting instructions](../docs/hosted-client-discovery.md). Calls still use the configured BSB events transport.
