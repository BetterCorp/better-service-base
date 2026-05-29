package tests

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
)

// testConfigPlugin is a minimal in-memory config plugin for integration testing.
type testConfigPlugin struct {
	services   map[string]bsb.PluginDefinition
	events     map[string]bsb.PluginDefinition
	observable map[string]bsb.PluginDefinition
	configs    map[string]map[string]any
}

func (p *testConfigPlugin) Init(_ context.Context, _ bsb.Observable) error { return nil }
func (p *testConfigPlugin) Run(_ context.Context, _ bsb.Observable) error  { return nil }
func (p *testConfigPlugin) Dispose() error                                 { return nil }

func (p *testConfigPlugin) GetServicePlugins(_ context.Context, _ bsb.Observable) (map[string]bsb.PluginDefinition, error) {
	return p.services, nil
}
func (p *testConfigPlugin) GetEventsPlugins(_ context.Context, _ bsb.Observable) (map[string]bsb.PluginDefinition, error) {
	return p.events, nil
}
func (p *testConfigPlugin) GetObservablePlugins(_ context.Context, _ bsb.Observable) (map[string]bsb.PluginDefinition, error) {
	return p.observable, nil
}
func (p *testConfigPlugin) GetPluginConfig(_ context.Context, _ bsb.Observable, _ bsb.PluginType, name string) (map[string]any, error) {
	if c, ok := p.configs[name]; ok {
		return c, nil
	}
	return nil, nil
}
func (p *testConfigPlugin) GetServicePluginDefinition(_ context.Context, _ bsb.Observable, name string) (*bsb.ServicePluginDefinition, error) {
	if def, ok := p.services[name]; ok {
		return &bsb.ServicePluginDefinition{Name: def.Plugin, Enabled: def.Enabled}, nil
	}
	return &bsb.ServicePluginDefinition{Name: name, Enabled: false}, nil
}

// testEventsPlugin is a minimal in-memory events plugin for integration testing.
type testEventsPlugin struct {
	listeners map[string]bsb.ReturnableListener
}

func newTestEventsPlugin() *testEventsPlugin {
	return &testEventsPlugin{listeners: make(map[string]bsb.ReturnableListener)}
}

func (p *testEventsPlugin) Init(_ context.Context, _ bsb.Observable) error { return nil }
func (p *testEventsPlugin) Run(_ context.Context, _ bsb.Observable) error  { return nil }
func (p *testEventsPlugin) Dispose() error                                 { return nil }
func (p *testEventsPlugin) OnBroadcast(_ context.Context, _ bsb.Observable, _, _ string, _ bsb.BroadcastListener) error {
	return nil
}
func (p *testEventsPlugin) EmitBroadcast(_ context.Context, _ bsb.Observable, _, _ string, _ any) error {
	return nil
}
func (p *testEventsPlugin) OnEvent(_ context.Context, _ bsb.Observable, _, _ string, _ bsb.EventListener) error {
	return nil
}
func (p *testEventsPlugin) EmitEvent(_ context.Context, _ bsb.Observable, _, _ string, _ any) error {
	return nil
}
func (p *testEventsPlugin) OnReturnableEvent(_ context.Context, _ bsb.Observable, plugin, event string, listener bsb.ReturnableListener) error {
	p.listeners[plugin+":"+event] = listener
	return nil
}

func (p *testEventsPlugin) EmitEventAndReturn(ctx context.Context, obs bsb.Observable, plugin, event string, _ time.Duration, payload any) (any, error) {
	listener, ok := p.listeners[plugin+":"+event]
	if !ok {
		return nil, nil
	}
	return listener(ctx, obs, payload)
}

func (p *testEventsPlugin) ReceiveStream(_ context.Context, _ bsb.Observable, _, _ string, _ bsb.StreamListener, _ time.Duration) (string, error) {
	return "", nil
}
func (p *testEventsPlugin) SendStream(_ context.Context, _ bsb.Observable, _, _, _ string, _ io.Reader) error {
	return nil
}

// testServicePlugin captures lifecycle calls for verification.
type testServicePlugin struct {
	initCalled bool
	runCalled  bool
	events     *bsb.PluginEvents
}

func (p *testServicePlugin) Init(_ context.Context, _ bsb.Observable) error {
	p.initCalled = true
	return nil
}
func (p *testServicePlugin) Run(_ context.Context, _ bsb.Observable) error {
	p.runCalled = true
	return nil
}
func (p *testServicePlugin) Dispose() error { return nil }
func (p *testServicePlugin) Metadata() bsb.PluginMetadata {
	return bsb.PluginMetadata{
		Name:    "test-service",
		Version: "1.0.0",
	}
}
func (p *testServicePlugin) SetEvents(events *bsb.PluginEvents)            { p.events = events }
func (p *testServicePlugin) SetObservableBackend(_ *bsb.ObservableBackend) {}

func TestServiceBaseIntegration(t *testing.T) {
	// Create a temp directory with a config file
	tmpDir := t.TempDir()
	configData := map[string]any{
		"observable": map[string]any{},
		"events": map[string]any{
			"events-default": map[string]any{
				"plugin":  "events-default",
				"enabled": true,
			},
		},
		"services": map[string]any{
			"test-service": map[string]any{
				"plugin":  "test-service",
				"enabled": true,
			},
		},
	}
	configJSON, _ := json.Marshal(map[string]any{"default": configData})
	_ = os.WriteFile(filepath.Join(tmpDir, "sec-config.json"), configJSON, 0644)

	// Track the created service plugin
	var createdPlugin *testServicePlugin

	registry := bsb.NewPluginRegistry()

	// Register a test config plugin (in-memory)
	registry.RegisterConfig("config-default", func(_ map[string]any) (bsb.ConfigPlugin, error) {
		return &testConfigPlugin{
			services: map[string]bsb.PluginDefinition{
				"test-service": {Plugin: "test-service", Enabled: true},
			},
			events: map[string]bsb.PluginDefinition{
				"events-default": {Plugin: "events-default", Enabled: true},
			},
			observable: map[string]bsb.PluginDefinition{},
			configs:    make(map[string]map[string]any),
		}, nil
	})

	// Register a simple events plugin
	registry.RegisterEvents("events-default", func(_ map[string]any) (bsb.EventsPlugin, error) {
		return newTestEventsPlugin(), nil
	})

	// Register our test service
	registry.RegisterService("test-service", func(_ map[string]any) (bsb.ServicePlugin, error) {
		createdPlugin = &testServicePlugin{}
		return createdPlugin, nil
	})

	opts := bsb.BSBOptions{
		Cwd:  tmpDir,
		Mode: bsb.ModeDevelopment,
	}

	sb := bsb.NewServiceBase(opts, registry)
	ctx := context.Background()

	if err := sb.Init(ctx); err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	if createdPlugin == nil {
		t.Fatal("service plugin was not created")
	}
	if !createdPlugin.initCalled {
		t.Error("service Init() was not called")
	}
	if createdPlugin.events == nil {
		t.Error("service events were not wired")
	}

	if err := sb.Run(ctx); err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	if !createdPlugin.runCalled {
		t.Error("service Run() was not called")
	}

	if err := sb.Dispose(); err != nil {
		t.Fatalf("Dispose failed: %v", err)
	}
}

func TestServiceBaseDoubleDispose(t *testing.T) {
	registry := bsb.NewPluginRegistry()
	registry.RegisterConfig("config-default", func(_ map[string]any) (bsb.ConfigPlugin, error) {
		return &testConfigPlugin{
			services:   map[string]bsb.PluginDefinition{},
			events:     map[string]bsb.PluginDefinition{"events-default": {Plugin: "events-default", Enabled: true}},
			observable: map[string]bsb.PluginDefinition{},
			configs:    make(map[string]map[string]any),
		}, nil
	})
	registry.RegisterEvents("events-default", func(_ map[string]any) (bsb.EventsPlugin, error) {
		return newTestEventsPlugin(), nil
	})

	sb := bsb.NewServiceBase(bsb.BSBOptions{Mode: bsb.ModeDevelopment}, registry)
	ctx := context.Background()
	_ = sb.Init(ctx)
	_ = sb.Run(ctx)

	// Double dispose should not error
	_ = sb.Dispose()
	err := sb.Dispose()
	if err != nil {
		t.Errorf("second dispose should not error, got: %v", err)
	}
}

func TestBuildResourceContext(t *testing.T) {
	rc := bsb.BuildResourceContext("my-service", "2.0.0", "app-123", bsb.ModeDevelopment, "eu-west-1")

	if rc.ServiceName != "my-service" {
		t.Errorf("expected 'my-service', got %q", rc.ServiceName)
	}
	if rc.ServiceVersion != "2.0.0" {
		t.Errorf("expected '2.0.0', got %q", rc.ServiceVersion)
	}
	if rc.ServiceInstanceID != "app-123" {
		t.Errorf("expected 'app-123', got %q", rc.ServiceInstanceID)
	}
	if rc.DeploymentEnv != "development" {
		t.Errorf("expected 'development', got %q", rc.DeploymentEnv)
	}
	if rc.DeploymentRegion != "eu-west-1" {
		t.Errorf("expected 'eu-west-1', got %q", rc.DeploymentRegion)
	}
}
