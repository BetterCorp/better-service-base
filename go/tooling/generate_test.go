package tooling

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	av "github.com/BetterCorp/AnyVali/sdk/go"
	"github.com/bettercorp/service-base/go/bsb"
)

func TestGeneratedClientCompilesAndPreservesOptionalNull(t *testing.T) {
	schemas := bsb.NewEventSchemas()
	schemas.OnReturnableEvents["echo"] = bsb.CreateReturnableEvent(bsb.ObjectSchema(map[string]bsb.BSBSchema{"name": bsb.StringSchema(), "note": bsb.OptionalWrap(bsb.NullableWrap(bsb.StringSchema()))}), bsb.StringSchema(), "echo")
	extensions := av.Object(map[string]av.Schema{"name": av.String()}).UnknownKeys(av.Allow)
	schemas.OnReturnableEvents["extend"] = bsb.CreateReturnableEvent(extensions, extensions, "extend")
	data, err := json.Marshal(bsb.ExportSchemas("service-echo", "1.0.0", schemas))
	if err != nil {
		t.Fatal(err)
	}
	code, err := GenerateClient(data, "echo")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(code), "bsb.Optional[*string]") {
		t.Fatalf("missing optional/null representation: %s", code)
	}
	directory := t.TempDir()
	module, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	files := map[string]string{"go.mod": "module generatedtest\n\ngo 1.26.1\nrequire github.com/bettercorp/service-base v0.0.0\nreplace github.com/bettercorp/service-base => " + strconv.Quote(filepath.ToSlash(module)) + "\n", "client.go": string(code), "client_test.go": `package bsbclients
import("context";"encoding/json";"testing";"github.com/bettercorp/service-base/go/bsb";"github.com/bettercorp/service-base/plugins/go/eventsdefault")
func TestRoundTrip(t *testing.T){
 input:=EchoClientEchoInput{Name:"ok"}
 data,_:=json.Marshal(input);if string(data)!="{\"name\":\"ok\"}"{t.Fatal(string(data))}
 input.Note=bsb.Some[*string](nil);data,_=json.Marshal(input);if string(data)!="{\"name\":\"ok\",\"note\":null}"{t.Fatal(string(data))}
 bus,_:=eventsdefault.New(nil);defer bus.Dispose();backend:=bsb.NewObservableBackend(bsb.ModeProduction,"test","test");parent:=bsb.NewPluginEvents("caller",bus,backend,bsb.ResourceContext{},bsb.NewEventSchemas())
 client,err:=NewEchoClient(parent);if err!=nil{t.Fatal(err)}
 bus.OnReturnableEvent(context.Background(),nil,"service-echo","echo",func(ctx context.Context,obs bsb.Observable,value any)(any,error){return value.(map[string]any)["name"],nil})
 result,err:=client.Echo(context.Background(),input);if err!=nil||result!="ok"{t.Fatalf("%s %v",result,err)}
 bus.OnReturnableEvent(context.Background(),nil,"service-echo","extend",func(ctx context.Context,obs bsb.Observable,value any)(any,error){return value,nil})
 extended:=map[string]any{"name":"ok","requestId":"abc","flags":[]any{"one",float64(2)}}
 echoed,err:=client.Extend(context.Background(),extended);if err!=nil{t.Fatal(err)}
 if echoed["requestId"]!="abc"||len(echoed["flags"].([]any))!=2{t.Fatalf("extensions lost: %#v",echoed)}
}
`}
	for name, contents := range files {
		if err = os.WriteFile(filepath.Join(directory, name), []byte(contents), 0644); err != nil {
			t.Fatal(err)
		}
	}
	command := exec.Command("go", "test", "-mod=mod", "./...")
	command.Dir = directory
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("generated client: %v\n%s", err, output)
	}
}
func TestRegistryIdentifiersAndGeneratorCollisions(t *testing.T) {
	if org, name, err := ParsePluginID("@acme/service.worker"); err != nil || org != "@acme" || name != "service.worker" {
		t.Fatal(org, name, err)
	}
	for _, id := range []string{"../bad", "a/b/c", "a\n"} {
		if _, _, err := ParsePluginID(id); err == nil {
			t.Fatal("accepted", id)
		}
	}
	schemas := bsb.NewEventSchemas()
	schemas.OnEvents["a-b"] = bsb.CreateFireAndForgetEvent(bsb.StringSchema())
	schemas.OnEvents["a_b"] = bsb.CreateFireAndForgetEvent(bsb.StringSchema())
	data, _ := json.Marshal(bsb.ExportSchemas("test", "1.0.0", schemas))
	if _, err := GenerateClient(data, "test"); err == nil {
		t.Fatal("accepted generated method collision")
	}
}

func TestInstallCollisionPreservesSnapshots(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"pluginName":"worker","events":{}}`))
	}))
	defer server.Close()
	registry, err := NewRegistry(server.URL, "", true)
	if err != nil {
		t.Fatal(err)
	}
	cwd := t.TempDir()
	directory := filepath.Join(cwd, ".bsb", "schemas")
	if err := os.MkdirAll(directory, 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(directory, "org-worker-nodejs.json")
	if err := os.WriteFile(path, []byte("existing"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := registry.Install(context.Background(), cwd, "org/worker", "nodejs", "1.2.3"); err == nil || !strings.Contains(err.Error(), "collide") {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "existing" {
		t.Fatal(string(data), err)
	}
	files, err := os.ReadDir(directory)
	if err != nil || len(files) != 1 {
		t.Fatal(files, err)
	}
}
