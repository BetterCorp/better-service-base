package tooling

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func TestSyncRemovesOnlyStaleGeneratedClients(t *testing.T) {
	root := t.TempDir()
	schemas := filepath.Join(root, ".bsb", "schemas")
	if err := os.MkdirAll(schemas, 0755); err != nil {
		t.Fatal(err)
	}
	old := filepath.Join(schemas, "old.json")
	data := []byte(`{"pluginId":"worker","events":{}}`)
	if err := os.WriteFile(old, data, 0644); err != nil {
		t.Fatal(err)
	}
	written, err := SyncClients(root)
	if err != nil {
		t.Fatal(err)
	}
	manual := filepath.Join(root, "bsbclients", "custom.go")
	if err = os.WriteFile(manual, []byte("package bsbclients\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err = os.Rename(old, filepath.Join(schemas, "new.json")); err != nil {
		t.Fatal(err)
	}
	if _, err = SyncClients(root); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(written[0]); !os.IsNotExist(err) {
		t.Fatal("stale client remains", err)
	}
	if _, err = os.Stat(manual); err != nil {
		t.Fatal("manual file removed", err)
	}
	if err = os.Remove(filepath.Join(schemas, "new.json")); err != nil {
		t.Fatal(err)
	}
	if _, err = SyncClients(root); err != nil {
		t.Fatal(err)
	}
	files, _ := filepath.Glob(filepath.Join(root, "bsbclients", "*.go"))
	if len(files) != 1 || files[0] != manual {
		t.Fatal(files)
	}
}

func TestBuildExternalPluginHostWithoutConstructingDuringExport(t *testing.T) {
	directory := t.TempDir()
	module, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	files := map[string]string{
		"go.mod":          "module example.com/worker\n\ngo 1.26.1\nrequire github.com/bettercorp/service-base v0.0.0\nreplace github.com/bettercorp/service-base => " + strconv.Quote(filepath.ToSlash(module)) + "\n",
		"bsb-plugin.json": `{"go":[{"id":"service-worker","package":"example.com/worker/plugin"}]}`,
		"plugin/plugin.go": `package plugin
import("github.com/bettercorp/service-base/go/bsb")
func Register(registry *bsb.PluginRegistry){
 registry.RegisterService("service-worker",func(map[string]any)(bsb.ServicePlugin,error){panic("export must not construct application plugins")})
 registry.RegisterContract(bsb.PluginContract{Metadata:bsb.PluginMetadata{Name:"service-worker",Version:"1.0.0",Category:bsb.PluginTypeService},Events:bsb.NewEventSchemas()})
}
`,
	}
	for name, contents := range files {
		path := filepath.Join(directory, name)
		if err = os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(path, []byte(contents), 0644); err != nil {
			t.Fatal(err)
		}
	}
	executable, err := BuildHost(context.Background(), directory)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(executable); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(filepath.Join(directory, "lib", "schemas", "service-worker.json")); err != nil {
		t.Fatal(err)
	}
}
