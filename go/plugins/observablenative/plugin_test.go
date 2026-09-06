package observablenative

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/bettercorp/service-base/go/bsb"
)

func TestRedactionBeforeInterpolationAndFileRotation(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.log")
	plugin, err := New("observable-logging-file", map[string]any{"path": path, "maxBytes": 500, "maxFiles": 2, "compress": false, "redact": []string{"meta.secret", "meta.users.*.password"}})
	if err != nil {
		t.Fatal(err)
	}
	backend := bsb.NewObservableBackend(bsb.ModeProduction, "test", "app")
	obs := bsb.NewObservable(bsb.NewDTrace(), bsb.ResourceContext{}, backend, "app")
	if err = plugin.Init(context.Background(), obs); err != nil {
		t.Fatal(err)
	}
	backend.AddPlugin(plugin)
	for i := 0; i < 8; i++ {
		obs.Log().Info("value {secret}", map[string]any{"secret": "do-not-write", "users": []any{map[string]any{"password": "hidden"}}})
	}
	if err = plugin.Dispose(); err != nil {
		t.Fatal(err)
	}
	files, err := filepath.Glob(path + "*")
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 3 {
		t.Fatalf("expected active + two retained files, got %v", files)
	}
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(data), "do-not-write") || strings.Contains(string(data), "hidden") || !strings.Contains(string(data), "[REDACTED]") {
			t.Fatalf("redaction failed: %s", data)
		}
	}
}
func TestOTLPLogsTracesAndMetricsFlush(t *testing.T) {
	var mu sync.Mutex
	received := map[string]int{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if len(body) != 1 {
			t.Errorf("unexpected OTLP envelope %v", body)
		}
		mu.Lock()
		received[r.URL.Path]++
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("{}"))
	}))
	defer server.Close()
	plugin, err := New("observable-opentelemetry", map[string]any{"endpoint": server.URL})
	if err != nil {
		t.Fatal(err)
	}
	backend := bsb.NewObservableBackend(bsb.ModeProduction, "test", "app")
	obs := bsb.NewObservable(bsb.NewDTrace(), bsb.ResourceContext{}, backend, "app")
	if err = plugin.Init(context.Background(), obs); err != nil {
		t.Fatal(err)
	}
	backend.AddPlugin(plugin)
	obs.Log().Info("hello")
	span := obs.StartSpan("work")
	span.End()
	obs.Metrics().Counter("requests", "Requests", "count").Increment()
	obs.Metrics().Gauge("precise", "Precision", "ratio").Set(.00001)
	if err = plugin.Dispose(); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	for _, signal := range []string{"logs", "traces", "metrics"} {
		if received["/v1/"+signal] != 1 {
			t.Errorf("missing %s export: %v", signal, received)
		}
	}
}
func TestGelfChunksAndTlsConfiguration(t *testing.T) {
	data := make([]byte, 4000)
	packets, err := gelfDatagrams(data, false)
	if err != nil || len(packets) != 4 {
		t.Fatalf("chunks %d: %v", len(packets), err)
	}
	for index, packet := range packets {
		if len(packet) > 1200 || packet[0] != 0x1e || packet[1] != 0x0f || packet[10] != byte(index) || packet[11] != 4 {
			t.Fatal("invalid GELF header")
		}
	}
	if _, err := newNetworkWriter(config{Host: "localhost", Port: 514, Protocol: "tls", Facility: float64(16), RFC: "5424", Framing: "newline", ClientKeyPath: "missing"}, "observable-syslog"); err == nil {
		t.Fatal("accepted incomplete mTLS identity")
	}
}

func TestRotationOnlyRemovesOwnArchives(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app[1].log")
	other := filepath.Join(dir, "app1.log.bsb-00000000000000000001")
	if err := os.WriteFile(other, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	f, err := newRotatingFile(path, config{MaxBytes: 1, MaxFiles: 1})
	if err != nil {
		t.Fatal(err)
	}
	defer f.close()
	for i := 0; i < 4; i++ {
		if err := f.write([]byte("line\n")); err != nil {
			t.Fatal(err)
		}
	}
	if data, err := os.ReadFile(other); err != nil || string(data) != "keep" {
		t.Fatal("removed unrelated archive")
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 3 {
		t.Fatalf("unexpected retained files: %v", entries)
	}
}
