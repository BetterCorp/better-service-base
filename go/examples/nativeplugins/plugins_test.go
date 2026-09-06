package nativeplugins

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
	clients "github.com/bettercorp/service-base/go/examples/nativeplugins/bsbclients"
	"github.com/bettercorp/service-base/go/host"
	"github.com/bettercorp/service-base/go/plugins/eventsdefault"
)

func TestLinkedExamplesRunInBSB(t *testing.T) {
	registry := host.NewRegistry()
	Register(registry)
	data, err := os.ReadFile("sec-config.json")
	if err != nil {
		t.Fatal(err)
	}
	var config map[string]any
	if err = bsb.DecodeJSON(data, &config); err != nil {
		t.Fatal(err)
	}
	config["services"].(map[string]any)["service-demo-todo"].(map[string]any)["enabled"] = false
	config["services"].(map[string]any)["service-benchmarkify"].(map[string]any)["enabled"] = true
	config["services"].(map[string]any)["service-benchmarkify"].(map[string]any)["config"] = map[string]any{"iterations": 2}
	raw, err := bsb.DecodeValue[map[string]any](config)
	if err != nil {
		t.Fatal(err)
	}
	jsonData, err := json.Marshal(raw)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("BSB_CONFIG_JSON", string(jsonData))
	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel()
	if err = bsb.NewServiceBase(bsb.BSBOptions{ConfigPlugin: "config-env", Cwd: t.TempDir()}, registry).RunAndWait(ctx); err != nil {
		t.Fatal(err)
	}
}
func TestTodoGeneratedClientPersistence(t *testing.T) {
	registry := host.NewRegistry()
	Register(registry)
	path := filepath.Join(t.TempDir(), "todos.json")
	service, err := registry.CreateService("service-demo-todo", map[string]any{"storage": map[string]any{"path": path}, "http": map[string]any{}, "features": map[string]any{}})
	if err != nil {
		t.Fatal(err)
	}
	p := service.(*Todo)
	bus, _ := eventsdefault.New(nil)
	backend := bsb.NewObservableBackend(bsb.ModeProduction, "test", "test")
	obs := bsb.NewObservable(bsb.NewDTrace(), bsb.ResourceContext{}, backend, "test")
	ctx := context.Background()
	bus.Init(ctx, obs)
	defer bus.Dispose()
	p.SetEvents(bsb.NewPluginEvents(p.name, bus, backend, bsb.ResourceContext{}, registry.EventSchemas(bsb.PluginTypeService, p.name)))
	if err = p.Init(ctx, obs); err != nil {
		t.Fatal(err)
	}
	client, err := clients.NewServiceDemoTodoClient(p.events)
	if err != nil {
		t.Fatal(err)
	}
	item, err := client.TodoCreate(ctx, clients.ServiceDemoTodoClientTodoCreateInput{Title: "native"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = client.TodoUpdate(ctx, clients.ServiceDemoTodoClientTodoUpdateInput{Id: item.Id, Completed: bsb.Some(true)}); err != nil {
		t.Fatal(err)
	}
	if err = p.Dispose(); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var saved []map[string]any
	if err = bsb.DecodeJSON(contents, &saved); err != nil || len(saved) != 1 || saved[0]["completed"] != true {
		t.Fatalf("persistence: %v %v", saved, err)
	}
	if _, err = client.TodoCreate(ctx, clients.ServiceDemoTodoClientTodoCreateInput{Title: ""}); err == nil {
		t.Fatal("accepted invalid todo")
	}
}
