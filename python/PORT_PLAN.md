# Native runtime status

The .NET and Python hosts load application plugins and provide native configuration, events, observability, generated clients and example services. See [Python usage](README.md), [.NET usage](../dotnet/README.md), and [LLM rules](../docs/public/llms/multilingual.txt).

Registry, Vault and syslog servers remain Node implementations. Their portable event contracts generate native clients; do not duplicate those clients manually. Go/Rust host completion is deferred. Registry language metadata also accepts Java; metadata support does not imply an implemented host.

Remaining integration work: real Node/.NET/Python Rabbit interoperability, PostgreSQL migration coverage, registry/Vault edge-flow review, and CI/container verification. Local tests are documented in each runtime README; mocked protocol tests alone do not establish broker interoperability.
