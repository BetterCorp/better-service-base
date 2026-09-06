package tests

import (
	"context"
	"errors"
	"github.com/bettercorp/service-base/go/bsb"
	"testing"
)

func TestGoProfileLanguageAndOverrides(t *testing.T) {
	var config bsb.JSONConfig
	data := []byte(`{"default":{"services":{"local":{"plugin":"service-test","config":{"a":1,"b":2}},"remote":{"enabled":false,"language":"python"}}},"staging":{"language":"go","services":{"local":{"config":{"b":3}}}}}`)
	if err := config.LoadDocument(data, "staging"); err != nil {
		t.Fatal(err)
	}
	got, err := config.GetPluginConfig(context.Background(), nil, bsb.PluginTypeService, "local")
	if err != nil || got["a"] != float64(1) || got["b"] != float64(3) {
		t.Fatalf("merge: %v %v", got, err)
	}
	for _, invalid := range []string{`null`, `{"default":{"language":"python"}}`, `{"default":{"services":{"bad":{"enabled":"false"}}}}`, `{"default":{"services":{"bad":{"language":"rust"}}}}`} {
		if err := config.LoadDocument([]byte(invalid), "default"); err == nil {
			t.Fatalf("accepted invalid profile %s", invalid)
		}
	}
	if err := config.LoadDocument(data, "missing"); err == nil {
		t.Fatal("missing profile accepted")
	}
}

type failingConfig struct {
	testConfigPlugin
	disposed bool
}

func (p *failingConfig) Init(context.Context, bsb.Observable) error {
	return errors.New("startup failed")
}
func (p *failingConfig) Dispose() error { p.disposed = true; return nil }
func TestStartupFailureDisposesConfig(t *testing.T) {
	registry := bsb.NewPluginRegistry()
	config := &failingConfig{}
	registry.RegisterConfig("config-default", func(map[string]any) (bsb.ConfigPlugin, error) { return config, nil })
	host := bsb.NewServiceBase(bsb.BSBOptions{}, registry)
	if err := host.RunAndWait(context.Background()); err == nil || !config.disposed {
		t.Fatalf("startup cleanup: %v disposed=%v", err, config.disposed)
	}
}

func TestContractValidationBeforeConstruction(t *testing.T) {
	registry := bsb.NewPluginRegistry()
	called := false
	registry.RegisterService("test", func(map[string]any) (bsb.ServicePlugin, error) {
		called = true
		return &mockServicePlugin{name: "test"}, nil
	})
	registry.RegisterContract(bsb.PluginContract{Metadata: bsb.PluginMetadata{Name: "test", Category: bsb.PluginTypeService}, Config: bsb.ObjectSchema(map[string]bsb.BSBSchema{"required": bsb.StringSchema()})})
	if _, err := registry.CreateService("test", nil); err == nil || called {
		t.Fatalf("constructor ran with invalid config: %v", err)
	}
	if _, err := registry.CreateService("test", map[string]any{"required": "valid"}); err != nil || !called {
		t.Fatalf("valid config failed: %v", err)
	}
}
