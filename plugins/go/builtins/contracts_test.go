package builtins

import (
	"testing"

	"github.com/bettercorp/service-base/go/bsb"
)

func TestSecretConfigFieldsAreSensitiveWriteOnly(t *testing.T) {
	registry := bsb.NewPluginRegistry()
	Register(registry)
	contracts, err := registry.ExportContracts()
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]map[string]any{}
	for _, contract := range contracts {
		byID[contract["pluginId"].(string)] = contract["configSchema"].(*bsb.SchemaDocument).Root["properties"].(map[string]any)
	}
	assertSecret := func(name string, node map[string]any) {
		t.Helper()
		metadata := node["metadata"].(map[string]any)
		if metadata["sensitive"] != true || metadata["writeonly"] != true {
			t.Fatalf("%s metadata=%v", name, metadata)
		}
	}
	inner := func(properties map[string]any, field string) map[string]any {
		return properties[field].(map[string]any)["schema"].(map[string]any)
	}
	assertSecret("headers", inner(byID["observable-opentelemetry"], "headers"))
	assertSecret("token", inner(byID["observable-axiom"], "token"))
	assertSecret("apiSecret", inner(byID["config-vault"], "apiSecret"))
	credentials := inner(byID["events-rabbitmq"], "credentials")["properties"].(map[string]any)
	assertSecret("credentials.password", inner(credentials, "password"))
	for name, node := range map[string]map[string]any{
		"resourceAttributes": inner(byID["observable-opentelemetry"], "resourceAttributes"),
		"apiKeyId":           inner(byID["config-vault"], "apiKeyId"),
	} {
		if metadata, exists := node["metadata"].(map[string]any); exists && (metadata["sensitive"] == true || metadata["writeonly"] == true) {
			t.Fatalf("%s marked secret: %v", name, metadata)
		}
	}
}
