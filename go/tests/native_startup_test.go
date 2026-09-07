package tests

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/bettercorp/service-base/go/bsb"
	"strings"
	"testing"
	"time"
)

func TestGoProfileLanguageAndOverrides(t *testing.T) {
	var config bsb.JSONConfig
	data := []byte(`{"default":{"services":{"local":{"plugin":"service-test","config":{"a":1,"b":2}},"remote":{"enabled":false,"language":"python"}}},"staging":{"language":"go","services":{"local":{"config":{"b":3}}}}}`)
	if err := config.LoadDocument(data, "staging"); err != nil {
		t.Fatal(err)
	}
	got, err := config.GetPluginConfig(context.Background(), nil, bsb.PluginTypeService, "local")
	if err != nil || got["a"] != json.Number("1") || got["b"] != json.Number("3") {
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

func TestStartupRequiresEnabledService(t *testing.T) {
	for name, services := range map[string]map[string]bsb.PluginDefinition{
		"empty":        {},
		"all disabled": {"disabled": {Plugin: "service-test", Enabled: false}},
	} {
		t.Run(name, func(t *testing.T) {
			registry := bsb.NewPluginRegistry()
			registry.RegisterConfig("config-default", func(map[string]any) (bsb.ConfigPlugin, error) {
				return &testConfigPlugin{
					services:   services,
					events:     map[string]bsb.PluginDefinition{},
					observable: map[string]bsb.PluginDefinition{},
				}, nil
			})
			registry.RegisterEvents("events-default", func(map[string]any) (bsb.EventsPlugin, error) {
				return newTestEventsPlugin(), nil
			})

			host := bsb.NewServiceBase(bsb.BSBOptions{Cwd: t.TempDir()}, registry)
			defer host.Dispose()
			err := host.Init(context.Background())
			if err == nil || !strings.Contains(err.Error(), "At least one enabled service is required") {
				t.Fatalf("expected missing enabled service error, got %v", err)
			}
		})
	}
}

type countedEvents struct {
	*testEventsPlugin
	disposals int
	runError  error
}

func (p *countedEvents) Run(context.Context, bsb.Observable) error { return p.runError }
func (p *countedEvents) Dispose() error                            { p.disposals++; return errors.New("cleanup failed") }
func TestHostHasOneCleanupPath(t *testing.T) {
	for _, fails := range []bool{false, true} {
		registry := bsb.NewPluginRegistry()
		registry.RegisterConfig("config-default", func(map[string]any) (bsb.ConfigPlugin, error) {
			return &testConfigPlugin{services: map[string]bsb.PluginDefinition{"test-service": {Plugin: "test-service", Enabled: true}}, events: map[string]bsb.PluginDefinition{"events-default": {Plugin: "events-default", Enabled: true}}, observable: map[string]bsb.PluginDefinition{}}, nil
		})
		plugin := &countedEvents{testEventsPlugin: newTestEventsPlugin()}
		if fails {
			plugin.runError = errors.New("run failed")
		}
		registry.RegisterEvents("events-default", func(map[string]any) (bsb.EventsPlugin, error) { return plugin, nil })
		registry.RegisterService("test-service", func(map[string]any) (bsb.ServicePlugin, error) { return &testServicePlugin{}, nil })
		host := bsb.NewServiceBase(bsb.BSBOptions{Cwd: t.TempDir()}, registry)
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
		err := host.RunAndWait(ctx)
		cancel()
		if plugin.disposals != 1 || err == nil || !strings.Contains(err.Error(), "cleanup failed") {
			t.Fatalf("disposals=%d err=%v", plugin.disposals, err)
		}
		if fails && !strings.Contains(err.Error(), "run failed") {
			t.Fatal(err)
		}
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
