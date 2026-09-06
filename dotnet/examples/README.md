# Native example plugins

`ExamplePlugins` is a class library containing `service-default0` through `service-default4`, `service-benchmarkify`, and `service-demo-todo`. BSB loads these services; the library has no application entry point. The benchmark is disabled in the sample profile.

From `dotnet/`, publish the host, then build the plugin from its application directory:

```sh
dotnet publish BetterServiceBase/BetterServiceBase.csproj -c Release -o output
cd examples/ExamplePlugins
dotnet ../../output/BetterServiceBase.dll plugin build ExamplePlugins.csproj
dotnet ../../output/BetterServiceBase.dll start
```

Open `http://127.0.0.1:3000`. The todo service has native Kestrel HTTP handling, typed self-clients, validated CRUD events, notifications, periodic stats, and atomic JSON snapshots. It reuses the Node example's static UI. Payloads are limited to 64 KiB. The URL determines the todo ID on updates. It is a local demo without authentication; keep the sample loopback binding for local use.

Storage is one process per JSON file. `storage.autoSaveInterval` defaults to 5000 ms, and shutdown performs a final save. Changes since the last snapshot can be lost on process/machine failure. Use a database for durable or multiple-writer deployments. File corruption fails startup rather than overwriting existing data. `features.maxTodos` defaults to 1000; `features.statsInterval` is seconds, with 0 disabling broadcasts.

The default services demonstrate constructor-created generated clients, registration in `Init`, requests in `Run`, and ordering through profile aliases. Benchmark uses `Stopwatch` and the generated RPC client, with configurable `iterations` (1–100000). It measures end-to-end local RPC throughput without an external benchmark dependency.

Canonical event snapshots live in `ExamplePlugins/.bsb/schemas`; clients in `BsbClients` are generated. To refresh them after changing the Node examples, build Node core and `@bsb/demo-todo-app`, run `node scripts/export-example-contracts.mjs` from the repository root, then `bsb client generate` from `ExamplePlugins`. Native schemas are imported intact; do not hand-edit generated clients.

`bsb plugin pack ExamplePlugins.csproj` makes the `BetterCorp.BSB.Examples` NuGet package, including manifests for all seven services. `bsb plugin install BetterCorp.BSB.Examples --version <version> --source <feed>` installs it for another application. Configure each logical service ID with that package and version. The host includes ASP.NET Core's shared framework for HTTP plugins.
