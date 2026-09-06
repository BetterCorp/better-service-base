package tooling

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func TestBuildExternalPluginHostWithoutConstructingDuringExport(t *testing.T) {
	directory := t.TempDir()
	module, err := filepath.Abs("..")
	if err != nil {
		t.Fatal(err)
	}
	files := map[string]string{
		"go.mod":          "module example.com/worker\n\ngo 1.26.1\nrequire github.com/bettercorp/service-base/go v0.0.0\nreplace github.com/bettercorp/service-base/go => " + strconv.Quote(filepath.ToSlash(module)) + "\n",
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
