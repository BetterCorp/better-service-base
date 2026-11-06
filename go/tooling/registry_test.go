package tooling

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestVersionPatternUsesStrictSemVer(t *testing.T) {
	data, err := os.ReadFile("../../tests/fixtures/semver-versions.json")
	if err != nil {
		t.Fatal(err)
	}
	var versions struct {
		Valid   []string `json:"valid"`
		Invalid []string `json:"invalid"`
	}
	if err := json.Unmarshal(data, &versions); err != nil {
		t.Fatal(err)
	}
	for _, version := range versions.Valid {
		if !versionPattern.MatchString(version) {
			t.Errorf("valid SemVer rejected: %q", version)
		}
	}
	for _, version := range versions.Invalid {
		if versionPattern.MatchString(version) {
			t.Errorf("invalid SemVer accepted: %q", version)
		}
	}
}

func TestCustomRegistryDoesNotInheritConfiguredToken(t *testing.T) {
	var authorization string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()

	t.Setenv("BSB_REGISTRY_URL", "https://registry.example")
	t.Setenv("BSB_REGISTRY_TOKEN", "must-not-leak")
	registry, err := NewRegistry(server.URL, "", true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := registry.Request(context.Background(), http.MethodGet, "/plugins", nil); err != nil {
		t.Fatal(err)
	}
	if authorization != "" {
		t.Fatalf("custom target received configured Authorization header: %q", authorization)
	}

	registry, err = NewRegistry(server.URL, "custom-token", true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := registry.Request(context.Background(), http.MethodGet, "/plugins", nil); err != nil {
		t.Fatal(err)
	}
	if authorization != "Bearer custom-token" {
		t.Fatalf("explicit custom token was not sent: %q", authorization)
	}
}
