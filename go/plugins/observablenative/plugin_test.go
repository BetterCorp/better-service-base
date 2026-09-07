package observablenative

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
)

func TestFileLoggingRecoversAfterRotationFailure(t *testing.T) {
	for _, missingParent := range []bool{false, true} {
		t.Run(fmt.Sprint(missingParent), func(t *testing.T) {
			root := t.TempDir()
			file, err := newRotatingFile(filepath.Join(root, "original.log"), config{MaxBytes: 10})
			if err != nil {
				t.Fatal(err)
			}
			defer file.close()
			if err = file.write([]byte("original")); err != nil {
				t.Fatal(err)
			}
			file.path = filepath.Join(root, "next.log")
			if missingParent {
				file.path = filepath.Join(root, "missing", "next.log")
			}
			if err = file.rotate(); err == nil {
				t.Fatal("expected rename failure")
			}
			if err = os.MkdirAll(filepath.Dir(file.path), 0700); err != nil {
				t.Fatal(err)
			}
			if err = file.write([]byte("recovered")); err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(file.path)
			if err != nil || string(data) != "recovered" {
				t.Fatal(string(data), err)
			}
			data, err = os.ReadFile(filepath.Join(root, "original.log"))
			if err != nil || string(data) != "original" {
				t.Fatal(string(data), err)
			}
			file.close()
			if file.write([]byte("closed")) == nil {
				t.Fatal("reopened a disposed logger")
			}
		})
	}
}

func TestTLSSyslogHonorsConfiguredFraming(t *testing.T) {
	fixture := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer fixture.Close()
	ca := filepath.Join(t.TempDir(), "ca.pem")
	if err := os.WriteFile(ca, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: fixture.Certificate().Raw}), 0600); err != nil {
		t.Fatal(err)
	}
	for _, framing := range []string{"newline", "octet-counting"} {
		t.Run(framing, func(t *testing.T) {
			listener, err := tls.Listen("tcp", "127.0.0.1:0", fixture.TLS)
			if err != nil {
				t.Fatal(err)
			}
			defer listener.Close()
			result := make(chan []byte, 1)
			go func() {
				connection, err := listener.Accept()
				if err != nil {
					result <- nil
					return
				}
				defer connection.Close()
				connection.SetDeadline(time.Now().Add(5 * time.Second))
				data, _ := io.ReadAll(connection)
				result <- data
			}()
			writer, err := newNetworkWriter(config{Host: "127.0.0.1", Port: listener.Addr().(*net.TCPAddr).Port, Protocol: "tls", CACertificatePath: ca, Facility: float64(16), RFC: "5424", Framing: framing}, "observable-syslog")
			if err != nil {
				t.Fatal(err)
			}
			defer writer.close()
			if err = writer.export(context.Background(), []map[string]any{{"timestamp": time.Now().Format(time.RFC3339Nano), "level": "info", "message": "hello"}}); err != nil {
				t.Fatal(err)
			}
			writer.close()
			data := <-result
			if framing == "newline" {
				if len(data) == 0 || data[0] != '<' || data[len(data)-1] != '\n' {
					t.Fatalf("invalid newline frame: %q", data)
				}
			} else {
				parts := strings.SplitN(string(data), " ", 2)
				if len(parts) != 2 || parts[0] != strconv.Itoa(len(parts[1])) || !strings.HasPrefix(parts[1], "<") {
					t.Fatalf("invalid octet frame: %q", data)
				}
			}
		})
	}
}

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
	var histogramPoint map[string]any
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
		if r.URL.Path == "/v1/metrics" {
			resource := body["resourceMetrics"].([]any)[0].(map[string]any)
			scope := resource["scopeMetrics"].([]any)[0].(map[string]any)
			for _, raw := range scope["metrics"].([]any) {
				metric := raw.(map[string]any)
				if metric["name"] == "latency" {
					histogramPoint = metric["histogram"].(map[string]any)["dataPoints"].([]any)[0].(map[string]any)
				}
			}
		}
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
	boundaries := []float64{10, 50}
	histogram := obs.Metrics().Histogram("latency", "Latency", "ms", boundaries)
	boundaries[0] = 100 // The metric owns its boundaries.
	for _, value := range []float64{5, 10, 25, 50, 75} {
		histogram.Record(value)
	}
	if err = plugin.Dispose(); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	if !reflect.DeepEqual(histogramPoint["bucketCounts"], []any{"2", "2", "1"}) ||
		!reflect.DeepEqual(histogramPoint["explicitBounds"], []any{float64(10), float64(50)}) ||
		histogramPoint["count"] != "5" || histogramPoint["sum"] != float64(165) {
		t.Fatalf("histogram distribution lost in OTLP export: %v", histogramPoint)
	}
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
