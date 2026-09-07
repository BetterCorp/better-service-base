package builtins

import (
	"strings"

	av "github.com/BetterCorp/AnyVali/sdk/go"
	"github.com/bettercorp/service-base/go/bsb"
)

// Built-in contracts are static and share the same options as their native factories.
func registerContracts(registry *bsb.PluginRegistry) {
	for _, kind := range []bsb.PluginType{bsb.PluginTypeConfig, bsb.PluginTypeEvents, bsb.PluginTypeObservable} {
		for _, name := range registry.ListPlugins(kind) {
			fields := map[string]av.Schema{}
			add := func(names string, schema av.Schema) {
				for _, field := range strings.Fields(names) {
					fields[field] = av.Optional(schema)
				}
			}
			switch kind {
			case bsb.PluginTypeConfig:
				add("cwd configFile", av.String())
				if strings.HasPrefix(name, "config-vault") {
					add("vaultUrl apiKeyId apiSecret cacheDir googleAudience", av.String())
					add("timeoutMs", av.Int32().Min(1000).Max(60000))
					add("staleAllowedHours", av.Int32().Min(0).Max(8760))
					add("allowInsecureHttp", av.Bool())
				}
			case bsb.PluginTypeEvents:
				if name == "events-rabbitmq" {
					add("platformKey", av.Nullable(av.String()))
					add("uniqueId", av.String())
					add("fatalOnDisconnect", av.Bool())
					add("prefetch", av.Int32().Min(1).Max(65535))
					add("endpoints", av.Array(av.String()))
					add("credentials", av.Object(map[string]av.Schema{"username": av.Optional(av.String()), "password": av.Optional(av.String())}))
				}
			case bsb.PluginTypeObservable:
				if name == "observable-default" {
					add("mode", av.Enum("production", "production-debug", "development"))
				} else {
					add("level", av.Enum("trace", "debug", "info", "warn", "error", "fatal"))
					add("redact", av.Array(av.String()))
					add("base", av.Record(av.Any()))
					add("path filePath endpoint serviceName serviceVersion token dataset orgId host protocol hostname appName rfc framing caCertificatePath clientCertificatePath clientKeyPath httpEndpoint", av.String())
					add("prettyPrint compress logs metrics traces allowInsecureHttp", av.Bool())
					add("maxBytes", av.Int64().Min(1))
					add("maxFiles", av.Int32().Min(0))
					add("flushIntervalMs", av.Int32().Min(100).Max(60000))
					add("maxBatchSize", av.Int32().Min(1).Max(4096))
					add("samplingRate", av.Float64().Min(0).Max(1))
					add("port", av.Int32().Min(1).Max(65535))
					add("interval", av.Enum("none", "hourly", "daily"))
					add("headers resourceAttributes", av.Record(av.String()))
					add("additionalFields", av.Record(av.Any()))
					add("facility", av.Union(av.String(), av.Int32().Min(0).Max(23)))
				}
			}
			registry.RegisterContract(bsb.PluginContract{Metadata: bsb.PluginMetadata{Name: name, Version: "1.0.0", Category: kind, Description: "Native Go " + name}, Config: av.Object(fields).UnknownKeys(av.Reject), Events: bsb.NewEventSchemas(), Documentation: []string{"README.md"}})
		}
	}
}
