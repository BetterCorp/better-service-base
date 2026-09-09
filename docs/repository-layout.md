# Frameworks, plugins and build outputs

Language directories contain the framework SDK and BSB host/tooling. Native plugin implementations belong under `plugins/<language>/`, including config, events, observability and example service packages. BSB owns startup; application plugins do not start a separate host.

| Language | SDK / host source | Plugin source |
| --- | --- | --- |
| .NET | `dotnet/BSB`, `dotnet/BetterServiceBase` | `plugins/dotnet/*`; examples in `plugins/dotnet/examples/ExamplePlugins` |
| Python | `python/src/bsb` | `plugins/python/builtins`, `plugins/python/examples` |
| Go | `go/bsb`, `go/host`, `go/tooling`, `go/cmd/bsb` | `plugins/go/*`; examples in `plugins/go/examples` |
| Rust | `rust` SDK, `rust/cli` executable/tooling | `plugins/rust/builtins`, `plugins/rust/native-examples` |

The root Go module and Cargo workspace let framework and plugin packages live in separate directories. All native Docker builds use the repository root as build context.

## .NET references and output

`BetterCorp.BSB` is the SDK NuGet package. Plugin class libraries reference it with `Private="false"` and `ExcludeAssets="runtime"`. The running host shares its BSB and AnyVali assemblies with each plugin; `AssemblyDependencyResolver` resolves plugin-private dependencies. Sharing the contract assemblies prevents incompatible interface identities from loading a second BSB assembly.

`BetterCorp.BSB.Cli` supplies the `bsb` executable and bundled native plugin DLLs. Its project builds those plugins without adding their assemblies as normal compile references. Publishing gathers their outputs beneath the host's `plugins/` directory. Application plugins load from configured package paths or local plugin directories.

The example project embeds portable contract inputs and generates C# clients inside `obj/` before compilation. Generated `.cs` files compile into the example DLL; they are not separate runtime dependencies. The example's reference to the CLI project is a build dependency used to run the generator. Building the CLI does not depend on building examples, so generation has no dependency cycle.

`dotnet build` uses normal `bin/<configuration>/<framework>` and `obj` outputs. `bsb plugin build` publishes deployable assemblies, dependency metadata and exported schemas to `lib/`; `bsb plugin pack` produces a NuGet package. Deploy the published plugin output, including its dependencies.

## Other languages

| Language | Client generation | Runtime and artifacts |
| --- | --- | --- |
| Python | The example package build hook stages contracts and generates Python clients before wheel/sdist collection. | Framework and builtin plugins are separate wheels. Application wheels expose `bsb.plugins` entry points; BSB discovers and loads their classes. Generated client modules ship in the application wheel. |
| Go | `bsb plugin build` runs project `go generate` directives and regenerates installed clients before compilation. Direct `go build`/`go test` users run `go generate` first. | Selected plugin packages and clients link into `lib/bsb`. The generated entry point calls BSB's lifecycle; Go plugins are not dynamically loaded DLLs. |
| Rust | The example crate's `build.rs` generates clients into Cargo's `OUT_DIR`, included when the crate compiles. | SDK, builtin plugin crate and CLI are separate packages. BSB's generated host links application crates and clients into `lib/bsb`. |

## Versioned inputs versus generated files

`plugins/contracts/examples/*.json` is the shared, versioned contract input for native examples. It replaces duplicated installation snapshots. Normal native builds consume it offline; see [contract maintenance](../plugins/contracts/README.md).

`.bsb` contains local installation/schema caches and generated host workspaces. `BsbClients`, `bsbclients`, generated Python clients, `obj`, `bin`, `lib`, `target`, wheels and package archives are outputs and must not be committed. Source projects, dependency locks, plugin declarations and shared portable contract inputs are committed. Contracts installed from Registry or hosted discovery remain local snapshots for offline regeneration.

Node external plugins use the existing `plugins/nodejs` workspaces and npm build hooks. This cleanup leaves the pre-existing Node bootstrap plugin layout unchanged.
