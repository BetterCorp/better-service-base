# Native runtime status

The .NET and Python hosts load application plugins and provide native configuration, events, observability, generated clients and example services. See [Python usage](README.md), [.NET usage](../dotnet/README.md), and [LLM rules](../docs/public/llms/multilingual.txt).

Registry, Vault and syslog servers remain Node implementations. Their portable event contracts generate native clients; do not duplicate those clients manually. Native Go and Rust hosts, backends, tooling and seven examples per language are implemented; see their READMEs and [verification status](../docs/native-go-rust-plan.md). Java remains metadata-only.

Real Node/.NET/Python/Go/Rust Rabbit integration passed all 20 directed RPC/trace/1 MiB stream pairs, absent listeners and crashed consumers. Shared Registry/Vault tests cover Go/Rust language isolation. PostgreSQL migrations and existing language builds passed CI at 017b1b9; the implementation plan records subsequent local checks and any outstanding CI/signing work.
