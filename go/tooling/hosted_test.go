package tooling

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHostedInstallAndDiscoveryBoundaries(t *testing.T) {
	fixture, err := os.ReadFile("../../tests/fixtures/hosted-discovery.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest map[string]any
	reset := func() {
		if err := json.Unmarshal(fixture, &manifest); err != nil {
			t.Fatal(err)
		}
	}
	reset()
	schema := manifest["plugins"].([]any)[0].(map[string]any)["schema"]
	var paths []string
	leaked := false
	redirect, oversized := false, false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		leaked = leaked || r.Header.Get("Authorization") != ""
		if redirect {
			http.Redirect(w, r, "/contracts/reports.json", http.StatusFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if oversized {
			_, _ = w.Write([]byte(strings.Repeat(" ", 4*1024*1024+1)))
			return
		}
		if r.URL.Path == "/.well-known/bsb" {
			_ = json.NewEncoder(w).Encode(manifest)
		} else {
			_ = json.NewEncoder(w).Encode(schema)
		}
	}))
	defer server.Close()
	t.Setenv("BSB_REGISTRY_TOKEN", "must-stay-local")
	ctx := context.Background()
	cwd := t.TempDir()
	options := HostedOptions{AllowHTTP: true}
	files, err := InstallHosted(ctx, cwd, server.URL, options)
	if err != nil || len(files) != 1 {
		t.Fatal(files, err)
	}
	snapshots, _ := filepath.Glob(filepath.Join(cwd, ".bsb", "schemas", "*.json"))
	if len(snapshots) != 1 {
		t.Fatal(snapshots)
	}
	var saved map[string]any
	data, _ := os.ReadFile(snapshots[0])
	_ = json.Unmarshal(data, &saved)
	if saved["pluginId"] != "service-reports" || saved["source"].(map[string]any)["url"] != server.URL {
		t.Fatal(saved)
	}
	entry := manifest["plugins"].([]any)[0].(map[string]any)
	entry["schema"] = "/contracts/reports.json"
	options.Plugin = "acme/service-reports"
	options.Version = "1.2.3-beta.1"
	if _, err = InstallHosted(ctx, cwd, server.URL, options); err != nil {
		t.Fatal(err)
	}
	if leaked || paths[len(paths)-1] != "/contracts/reports.json" {
		t.Fatal(paths, leaked)
	}
	before, _ := os.ReadFile(snapshots[0])
	manifest["plugins"] = append(manifest["plugins"].([]any), map[string]any{"id": "second", "language": "nodejs", "version": "1.0.0", "schema": schema})
	if _, err = InstallHosted(ctx, cwd, server.URL, HostedOptions{AllowHTTP: true}); err == nil {
		t.Fatal("ambiguous install accepted")
	}
	after, _ := os.ReadFile(snapshots[0])
	if string(after) != string(before) {
		t.Fatal("ambiguous install changed snapshot")
	}
	manifest["plugins"] = []any{entry}
	for _, link := range []string{"https://elsewhere.invalid/schema", server.URL + "/#fragment", "http://user:password@" + strings.TrimPrefix(server.URL, "http://") + "/schema"} {
		entry["schema"] = link
		if _, _, err = HostedSchema(ctx, server.URL, options); err == nil {
			t.Fatal("unsafe link accepted", link)
		}
	}
	reset()
	manifest["bsb"] = "1"
	if _, _, err = HostedSchema(ctx, server.URL, options); err == nil {
		t.Fatal("string discovery revision accepted")
	}
	reset()
	manifest["plugins"].([]any)[0].(map[string]any)["schema"].(map[string]any)["version"] = "9.0.0"
	if _, _, err = HostedSchema(ctx, server.URL, options); err == nil {
		t.Fatal("mismatched schema version accepted")
	}
	reset()
	manifest["plugins"].([]any)[0].(map[string]any)["version"] = "../bad"
	if _, _, err = HostedSchema(ctx, server.URL, options); err == nil {
		t.Fatal("invalid version accepted")
	}
	redirect = true
	if _, _, err = HostedSchema(ctx, server.URL, options); err == nil {
		t.Fatal("redirect accepted")
	}
	redirect = false
	oversized = true
	if _, _, err = HostedSchema(ctx, server.URL, options); err == nil {
		t.Fatal("oversized response accepted")
	}
	count := len(paths)
	if _, _, err = HostedSchema(ctx, server.URL, HostedOptions{}); err == nil {
		t.Fatal("HTTP accepted without opt-in")
	}
	if _, _, err = HostedSchema(ctx, server.URL+"/api", options); err == nil {
		t.Fatal("path accepted")
	}
	if _, err = SyncClients(cwd); err != nil {
		t.Fatal(err)
	}
	if len(paths) != count {
		t.Fatal("offline sync made requests")
	}
	reset()
	oversized = false
	local := strings.TrimSuffix(filepath.Base(snapshots[0]), ".json")
	if err = os.WriteFile(filepath.Join(filepath.Dir(snapshots[0]), strings.ReplaceAll(local, "~", "-")+".json"), []byte("{}"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err = InstallHosted(ctx, cwd, server.URL, options); err == nil || !strings.Contains(err.Error(), "collide") {
		t.Fatal("collision accepted", err)
	}
	after, _ = os.ReadFile(snapshots[0])
	if string(after) != string(before) {
		t.Fatal("collision changed snapshot")
	}
}
