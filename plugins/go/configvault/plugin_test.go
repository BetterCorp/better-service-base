package configvault

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

func validResponse() response {
	return response{Language: "go", Profile: "default", Application: "app", Group: "group", Version: 1, Config: map[string]any{"default": map[string]any{"services": map[string]any{"worker": map[string]any{"config": map[string]any{"count": float64(1)}, "envOverridePaths": []any{"count"}}}}}}
}
func TestVaultCacheAndValidation(t *testing.T) {
	p := &Plugin{endpoint: "https://vault.example", keyID: "key", secret: "secret", cacheDir: t.TempDir(), stale: time.Hour}
	result := validResponse()
	if err := p.apply(result); err != nil {
		t.Fatal(err)
	}
	if err := p.writeCache(result); err != nil {
		t.Fatal(err)
	}
	if _, err := p.readCache(); err != nil {
		t.Fatal(err)
	}
	p.secret = "wrong"
	if _, err := p.readCache(); err == nil {
		t.Fatal("accepted cache under wrong key")
	}
	p.secret = "secret"
	p.stale = 0
	if _, err := p.readCache(); err == nil {
		t.Fatal("accepted expired cache")
	}
	p.stale = time.Hour
	data, err := os.ReadFile(p.cacheFile())
	if err != nil {
		t.Fatal(err)
	}
	var envelope sealed
	if err = json.Unmarshal(data, &envelope); err != nil {
		t.Fatal(err)
	}
	envelope.Data[0] ^= 1
	data, _ = json.Marshal(envelope)
	if err = os.WriteFile(p.cacheFile(), data, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := p.readCache(); err == nil {
		t.Fatal("accepted tampered cache")
	}
	result.Language = "python"
	if err := p.apply(result); err == nil {
		t.Fatal("accepted wrong host language")
	}
	result.Language = "go"
	t.Setenv("BSB_CONFIG_OVERRIDES", `{"services":{"worker":{"count":2}}}`)
	if err := p.apply(result); err != nil {
		t.Fatal(err)
	}
	t.Setenv("BSB_CONFIG_OVERRIDES", `{"services":{"worker":{"secret":"replacement"}}}`)
	if err := p.apply(result); err == nil {
		t.Fatal("accepted unauthorized override")
	}
}
func TestVaultAuthAndMalformedResponsesNeverUseCache(t *testing.T) {
	for _, status := range []int{401, 403, 302, 200} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("x-vault-secret") != "secret" {
				t.Error("missing credentials")
			}
			w.WriteHeader(status)
			w.Write([]byte("not JSON"))
		}))
		p := &Plugin{endpoint: server.URL, keyID: "key", secret: "secret", timeout: time.Second}
		_, retryable, err := p.fetch(context.Background())
		server.Close()
		if err == nil || retryable {
			t.Fatalf("status %d: retryable=%v err=%v", status, retryable, err)
		}
	}
}
