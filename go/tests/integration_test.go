package tests

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
	"github.com/bettercorp/service-base/plugins/go/observablenative"
)

func TestObservablePathsUseApplicationCwd(t *testing.T) {
	cwd := t.TempDir()
	registry := bsb.NewPluginRegistry()
	registry.RegisterConfig("config-default", func(map[string]any) (bsb.ConfigPlugin, error) {
		return &testConfigPlugin{
			services:   map[string]bsb.PluginDefinition{"test-service": {Plugin: "test-service", Enabled: true}},
			events:     map[string]bsb.PluginDefinition{"events-default": {Plugin: "events-default", Enabled: true}},
			observable: map[string]bsb.PluginDefinition{"file": {Plugin: "observable-logging-file", Enabled: true}},
			configs:    map[string]map[string]any{"file": {"path": "logs/app.log"}},
		}, nil
	})
	registry.RegisterObservable("observable-logging-file", func(config map[string]any) (bsb.ObservablePlugin, error) {
		return observablenative.New("observable-logging-file", config)
	})
	registry.RegisterEvents("events-default", func(map[string]any) (bsb.EventsPlugin, error) { return newTestEventsPlugin(), nil })
	registry.RegisterService("test-service", func(map[string]any) (bsb.ServicePlugin, error) { return &testServicePlugin{}, nil })
	host := bsb.NewServiceBase(bsb.BSBOptions{Cwd: cwd}, registry)
	defer host.Dispose()
	if err := host.Init(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(cwd, "logs/app.log")); err != nil {
		t.Fatal(err)
	}
}

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

type failingEventsPlugin struct {
	*testEventsPlugin
	failed   chan error
	disposed bool
}

func (p *failingEventsPlugin) Failure() <-chan error { return p.failed }
func (p *failingEventsPlugin) Dispose() error        { p.disposed = true; return nil }

type tracedServicePlugin struct{ mockServicePlugin }

func (*tracedServicePlugin) Init(_ context.Context, obs bsb.Observable) error {
	span := obs.StartSpan("init.child")
	span.End()
	return nil
}
func (*tracedServicePlugin) Run(_ context.Context, obs bsb.Observable) error {
	span := obs.StartSpan("run.child")
	span.End()
	return nil
}

func TestServiceLifecycleCreatesParentlessRootSpans(t *testing.T) {
	registry := bsb.NewPluginRegistry()
	recorder := &recordingObservablePlugin{}
	registry.RegisterConfig("config-default", func(map[string]any) (bsb.ConfigPlugin, error) {
		return &testConfigPlugin{
			services:   map[string]bsb.PluginDefinition{"service-traced": {Enabled: true}},
			events:     map[string]bsb.PluginDefinition{"events-default": {Enabled: true}},
			observable: map[string]bsb.PluginDefinition{"observable-recorder": {Enabled: true}},
		}, nil
	})
	registry.RegisterObservable("observable-recorder", func(map[string]any) (bsb.ObservablePlugin, error) { return recorder, nil })
	registry.RegisterEvents("events-default", func(map[string]any) (bsb.EventsPlugin, error) { return newTestEventsPlugin(), nil })
	registry.RegisterService("service-traced", func(map[string]any) (bsb.ServicePlugin, error) { return &tracedServicePlugin{}, nil })
	host := bsb.NewServiceBase(bsb.BSBOptions{Cwd: t.TempDir()}, registry)
	defer host.Dispose()
	if err := host.Init(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := host.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(recorder.parents) != 4 || recorder.names[0] != "service.init" || recorder.names[1] != "init.child" || recorder.names[2] != "service.run" || recorder.names[3] != "run.child" {
		t.Fatalf("unexpected lifecycle spans: %v", recorder.names)
	}
	for _, index := range []int{0, 2} {
		if recorder.parents[index].SpanID != "" {
			t.Fatalf("lifecycle root %q has phantom parent %q", recorder.names[index], recorder.parents[index].SpanID)
		}
		if recorder.parents[index+1].SpanID != recorder.ids[index] {
			t.Fatalf("nested span %q has parent %q, want %q", recorder.names[index+1], recorder.parents[index+1].SpanID, recorder.ids[index])
		}
	}
}

func TestConfiguredPluginVersionsReachAllControllers(t *testing.T) {
	tests := []struct {
		name, version string
		mismatch      bsb.PluginType
	}{
		{"service mismatch", "9.9.9", bsb.PluginTypeService},
		{"events mismatch", "9.9.9", bsb.PluginTypeEvents},
		{"observable mismatch", "9.9.9", bsb.PluginTypeObservable},
		{"matching", "1.2.3", ""},
		{"unpinned", "", ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			registry := bsb.NewPluginRegistry()
			calls := map[bsb.PluginType]int{}
			version := func(kind bsb.PluginType) string {
				if test.mismatch == "" || test.mismatch == kind {
					return test.version
				}
				return "1.2.3"
			}
			registry.RegisterConfig("config-default", func(map[string]any) (bsb.ConfigPlugin, error) {
				return &testConfigPlugin{
					services:   map[string]bsb.PluginDefinition{"service-versioned": {Enabled: true, Version: version(bsb.PluginTypeService)}},
					events:     map[string]bsb.PluginDefinition{"events-versioned": {Enabled: true, Version: version(bsb.PluginTypeEvents)}},
					observable: map[string]bsb.PluginDefinition{"observable-versioned": {Enabled: true, Version: version(bsb.PluginTypeObservable)}},
				}, nil
			})
			registry.RegisterObservable("observable-versioned", func(map[string]any) (bsb.ObservablePlugin, error) {
				calls[bsb.PluginTypeObservable]++
				return &recordingObservablePlugin{}, nil
			})
			registry.RegisterEvents("events-versioned", func(map[string]any) (bsb.EventsPlugin, error) {
				calls[bsb.PluginTypeEvents]++
				return newTestEventsPlugin(), nil
			})
			registry.RegisterService("service-versioned", func(map[string]any) (bsb.ServicePlugin, error) {
				calls[bsb.PluginTypeService]++
				return &mockServicePlugin{name: "service-versioned"}, nil
			})
			for _, item := range []struct {
				kind bsb.PluginType
				name string
			}{{bsb.PluginTypeObservable, "observable-versioned"}, {bsb.PluginTypeEvents, "events-versioned"}, {bsb.PluginTypeService, "service-versioned"}} {
				registry.RegisterContract(bsb.PluginContract{Metadata: bsb.PluginMetadata{Name: item.name, Category: item.kind, Version: "1.2.3"}, Events: bsb.NewEventSchemas()})
			}

			host := bsb.NewServiceBase(bsb.BSBOptions{Cwd: t.TempDir()}, registry)
			err := host.Init(context.Background())
			if test.mismatch != "" {
				if err == nil {
					t.Fatal("configured version mismatch was accepted")
				}
				if calls[test.mismatch] != 0 {
					t.Fatalf("%s factory ran before version validation", test.mismatch)
				}
			} else if err != nil {
				t.Fatalf("valid configured versions were rejected: %v", err)
			}
			_ = host.Dispose()
		})
	}
}

func TestHostStopsWhenFilteredBackendFails(t *testing.T) {
	registry := bsb.NewPluginRegistry()
	registry.RegisterConfig("config-default", func(map[string]any) (bsb.ConfigPlugin, error) {
		return &testConfigPlugin{
			services: map[string]bsb.PluginDefinition{"test-service": {Plugin: "test-service", Enabled: true}}, observable: map[string]bsb.PluginDefinition{},
			events: map[string]bsb.PluginDefinition{"a-local": {Plugin: "events-default", Enabled: true}, "z-rabbit": {Plugin: "events-failing", Enabled: true, Filter: []any{"emitEvent"}}},
		}, nil
	})
	registry.RegisterEvents("events-default", func(map[string]any) (bsb.EventsPlugin, error) { return newTestEventsPlugin(), nil })
	broken := &failingEventsPlugin{testEventsPlugin: newTestEventsPlugin(), failed: make(chan error, 1)}
	expected := errors.New("broker disconnected")
	broken.failed <- expected
	registry.RegisterEvents("events-failing", func(map[string]any) (bsb.EventsPlugin, error) { return broken, nil })
	registry.RegisterService("test-service", func(map[string]any) (bsb.ServicePlugin, error) { return &testServicePlugin{}, nil })
	host := bsb.NewServiceBase(bsb.BSBOptions{Cwd: t.TempDir()}, registry)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := host.RunAndWait(ctx); !errors.Is(err, expected) {
		t.Fatalf("lost backend failure: %v", err)
	}
	if !broken.disposed {
		t.Fatal("backend was not disposed")
	}
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
	var eventInstances int
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
				"events-default": {Plugin: "events-default", Enabled: true, Filter: []any{}},
			},
			observable: map[string]bsb.PluginDefinition{},
			configs:    make(map[string]map[string]any),
		}, nil
	})

	// Register a simple events plugin
	registry.RegisterEvents("events-default", func(_ map[string]any) (bsb.EventsPlugin, error) {
		eventInstances++
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
	if eventInstances != 2 {
		t.Fatalf("filtered events backend did not get a local fallback: %d", eventInstances)
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
