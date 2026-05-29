package tests

import (
	"context"
	"testing"

	"github.com/bettercorp/service-base/go/bsb"
)

// mockServicePlugin is a minimal service plugin for testing.
type mockServicePlugin struct {
	name   string
	events *bsb.PluginEvents
}

func (m *mockServicePlugin) Init(_ context.Context, _ bsb.Observable) error { return nil }
func (m *mockServicePlugin) Run(_ context.Context, _ bsb.Observable) error  { return nil }
func (m *mockServicePlugin) Dispose() error                                 { return nil }
func (m *mockServicePlugin) Metadata() bsb.PluginMetadata {
	return bsb.PluginMetadata{Name: m.name, Version: "1.0.0"}
}
func (m *mockServicePlugin) SetEvents(events *bsb.PluginEvents)            { m.events = events }
func (m *mockServicePlugin) SetObservableBackend(_ *bsb.ObservableBackend) {}

func TestPluginRegistryRegisterAndCreate(t *testing.T) {
	registry := bsb.NewPluginRegistry()

	registry.RegisterService("test-service", func(config map[string]any) (bsb.ServicePlugin, error) {
		return &mockServicePlugin{name: "test-service"}, nil
	})

	if !registry.HasPlugin(bsb.PluginTypeService, "test-service") {
		t.Error("expected plugin to be registered")
	}
	if registry.HasPlugin(bsb.PluginTypeService, "nonexistent") {
		t.Error("expected nonexistent plugin to not be registered")
	}

	plugin, err := registry.CreateService("test-service", nil)
	if err != nil {
		t.Fatalf("failed to create plugin: %v", err)
	}
	if plugin.Metadata().Name != "test-service" {
		t.Errorf("expected name 'test-service', got %q", plugin.Metadata().Name)
	}
}

func TestPluginRegistryNotFound(t *testing.T) {
	registry := bsb.NewPluginRegistry()

	_, err := registry.CreateService("nonexistent", nil)
	if err == nil {
		t.Error("expected error for nonexistent plugin")
	}

	pnf, ok := err.(*bsb.PluginNotFoundError)
	if !ok {
		t.Errorf("expected PluginNotFoundError, got %T", err)
	}
	if pnf.PluginName != "nonexistent" {
		t.Errorf("expected plugin name 'nonexistent', got %q", pnf.PluginName)
	}
}

func TestPluginRegistryListPlugins(t *testing.T) {
	registry := bsb.NewPluginRegistry()

	registry.RegisterService("svc-a", func(_ map[string]any) (bsb.ServicePlugin, error) {
		return &mockServicePlugin{name: "svc-a"}, nil
	})
	registry.RegisterService("svc-b", func(_ map[string]any) (bsb.ServicePlugin, error) {
		return &mockServicePlugin{name: "svc-b"}, nil
	})

	names := registry.ListPlugins(bsb.PluginTypeService)
	if len(names) != 2 {
		t.Errorf("expected 2 service plugins, got %d", len(names))
	}

	// Should have no config plugins
	configNames := registry.ListPlugins(bsb.PluginTypeConfig)
	if len(configNames) != 0 {
		t.Errorf("expected 0 config plugins, got %d", len(configNames))
	}
}
