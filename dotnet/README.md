# .NET BSB host

BSB is the executable host. Application services are class-library plugins that reference BSB for their contracts; they do not start their own `ServiceBase` process.

```sh
dotnet publish BetterServiceBase/BetterServiceBase.csproj -c Release -o output
```

Run `dotnet /absolute/path/to/output/BetterServiceBase.dll` from the application's working directory. Configure services in `bsb-config.json` (or `BSB_CONFIG_FILE`) and place each published plugin at `plugins/<plugin-name>/<plugin-name>.dll`, alongside its private dependencies and `.deps.json`. BSB also searches its own `plugins/` directory for the bundled config, observable and events defaults. `BSB_PLUGIN_DIR` supports externally mounted, versioned packages.

The `version` field selects among versions in mounted package directories. Local and flat plugin layouts accept it as metadata; a missing version in a versioned package does not fall back to a flat or local DLL.

Plugin projects should use `<EnableDynamicLoading>true</EnableDynamicLoading>`. Reference BSB with `Private="false"` and `ExcludeAssets="runtime"`; the loader shares the running host's BSB assembly so plugin contracts retain the same type identity. Private managed/native dependencies resolve through `AssemblyDependencyResolver`.

The runtime remains an incomplete port, not full Node.js feature parity. The host smoke test verifies external discovery, aliases, configuration, shared contract identity, event wiring, metadata and lifecycle:

```sh
dotnet run --project tests/SmokeTests -c Release -- output tests/TestPlugin/bin/Release/net10.0
```
