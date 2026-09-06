package configvault

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
	"golang.org/x/oauth2"
	"google.golang.org/api/idtoken"
)

type Plugin struct {
	bsb.JSONConfig
	endpoint, keyID, secret, cacheDir, audience string
	google                                      bool
	timeout, stale                              time.Duration
	token                                       oauth2.TokenSource
}
type response struct {
	Language    string         `json:"language"`
	Profile     string         `json:"profile"`
	Application string         `json:"application"`
	Group       string         `json:"group"`
	Version     int            `json:"version"`
	Config      map[string]any `json:"config"`
}
type cached struct {
	FetchedAt time.Time `json:"fetchedAt"`
	Response  response  `json:"response"`
}
type sealed struct {
	IV   []byte `json:"iv"`
	Data []byte `json:"data"`
}

func New(config map[string]any, google bool) (bsb.ConfigPlugin, error) {
	setting := func(key string) string {
		if value, ok := config[key]; ok {
			return fmt.Sprint(value)
		}
		return os.Getenv(key)
	}
	endpoint, err := bsb.EndpointOrigin(setting("vaultUrl"), setting("allowInsecureHttp") == "true")
	if err != nil {
		return nil, err
	}
	p := &Plugin{endpoint: endpoint, keyID: setting("apiKeyId"), secret: setting("apiSecret"), cacheDir: setting("cacheDir"), audience: setting("googleAudience"), google: google}
	if p.keyID == "" || p.secret == "" || (google && p.audience == "") {
		return nil, fmt.Errorf("Vault credentials and Google audience (when enabled) are required")
	}
	duration := func(key string, fallback, min, max int) (int, error) {
		raw := setting(key)
		if raw == "" {
			return fallback, nil
		}
		n, err := strconv.Atoi(raw)
		if err != nil || n < min || n > max {
			return 0, fmt.Errorf("invalid %s", key)
		}
		return n, nil
	}
	timeout, err := duration("timeoutMs", 5000, 1000, 60000)
	if err != nil {
		return nil, err
	}
	p.timeout = time.Duration(timeout) * time.Millisecond
	stale, err := duration("staleAllowedHours", 24, 0, 8760)
	if err != nil {
		return nil, err
	}
	p.stale = time.Duration(stale) * time.Hour
	if p.cacheDir == "" {
		cwd := setting("cwd")
		if cwd == "" {
			cwd = "."
		}
		p.cacheDir = filepath.Join(cwd, ".bsb", "config-vault")
	}
	return p, nil
}
func Register(registry *bsb.PluginRegistry) {
	registry.RegisterConfig("config-vault", func(config map[string]any) (bsb.ConfigPlugin, error) { return New(config, false) })
	registry.RegisterConfig("config-vault-google", func(config map[string]any) (bsb.ConfigPlugin, error) { return New(config, true) })
}
func (p *Plugin) Init(ctx context.Context, obs bsb.Observable) error {
	result, retryable, err := p.fetch(ctx)
	if err != nil {
		if !retryable || p.stale == 0 {
			return err
		}
		result, err = p.readCache()
		if err != nil {
			return fmt.Errorf("Vault unavailable and cache unusable: %w", err)
		}
		if err = p.apply(result); err != nil {
			return err
		}
		obs.Log().Warn("Vault unavailable; using encrypted cached configuration")
		return nil
	}
	if err = p.apply(result); err != nil {
		return err
	}
	if err = p.writeCache(result); err != nil {
		obs.Log().Warn("Vault loaded; encrypted cache could not be written")
	}
	return nil
}
func (p *Plugin) fetch(ctx context.Context) (response, bool, error) {
	deadline, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var last error
	refreshed := false
	for {
		var result response
		headers := map[string]string{"x-vault-key-id": p.keyID, "x-vault-secret": p.secret}
		if p.google {
			if p.token == nil {
				source, err := idtoken.NewTokenSource(deadline, p.audience)
				if err != nil {
					return result, false, fmt.Errorf("Google identity unavailable")
				}
				p.token = source
			}
			token, err := p.token.Token()
			if err != nil {
				return result, false, fmt.Errorf("Google identity unavailable")
			}
			headers["X-Serverless-Authorization"] = "Bearer " + token.AccessToken
		}
		err := bsb.JSONRequest(deadline, http.MethodGet, p.endpoint+"/runtime/config", nil, headers, p.timeout, &result)
		if err == nil {
			return result, false, nil
		}
		var status *bsb.HTTPStatusError
		if errors.As(err, &status) {
			if p.google && !refreshed && (status.Status == 401 || status.Status == 403) {
				p.token = nil
				refreshed = true
				continue
			}
			if status.Status != 429 && status.Status != 502 && status.Status != 503 && status.Status != 504 {
				return result, false, fmt.Errorf("Vault refused configuration: %w", err)
			}
		} else {
			var certificate *tls.CertificateVerificationError
			if errors.As(err, &certificate) {
				return result, false, fmt.Errorf("Vault TLS verification failed")
			}
			// Invalid JSON and oversized successful responses must never fall back to stale data.
			var syntax *json.SyntaxError
			var typed *json.UnmarshalTypeError
			if errors.As(err, &syntax) || errors.As(err, &typed) || strings.Contains(err.Error(), "size limit") {
				return result, false, fmt.Errorf("invalid Vault response")
			}
		}
		last = err
		select {
		case <-ctx.Done():
			return response{}, false, ctx.Err()
		case <-deadline.Done():
			return response{}, true, fmt.Errorf("Vault retry budget exhausted: %w", last)
		case <-time.After(250 * time.Millisecond):
		}
	}
}
func (p *Plugin) apply(result response) error {
	if result.Language != "go" || result.Version < 1 || result.Config == nil {
		return fmt.Errorf("invalid Vault response or deployment language")
	}
	for _, value := range []string{result.Profile, result.Application, result.Group} {
		if len(value) == 0 || len(value) > 100 {
			return fmt.Errorf("invalid Vault deployment identity")
		}
	}
	data, err := json.Marshal(result.Config)
	if err != nil {
		return err
	}
	var config map[string]any
	if err = bsb.DecodeJSON(data, &config); err != nil {
		return err
	}
	if err = applyOverrides(config, result.Profile, os.Getenv("BSB_CONFIG_OVERRIDES")); err != nil {
		return err
	}
	data, err = json.Marshal(config)
	if err != nil {
		return err
	}
	if err = p.LoadDocument(data, result.Profile); err != nil {
		return err
	}
	services, err := p.GetServicePlugins(context.Background(), nil)
	if err != nil {
		return err
	}
	for _, service := range services {
		if service.Enabled {
			return nil
		}
	}
	return fmt.Errorf("Vault requires at least one enabled service")
}
func (p *Plugin) binding() []byte { return []byte(p.endpoint + "\n" + p.keyID + "\ngo") }
func (p *Plugin) encryption() (cipher.AEAD, error) {
	key, err := hkdf.Key(sha256.New, []byte(p.secret), p.binding(), "BSB config-vault cache v1", 32)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
func (p *Plugin) cacheFile() string {
	hash := sha256.Sum256(p.binding())
	return filepath.Join(p.cacheDir, hex.EncodeToString(hash[:])+".go.json")
}
func (p *Plugin) writeCache(result response) error {
	plaintext, err := json.Marshal(cached{time.Now().UTC(), result})
	if err != nil {
		return err
	}
	encryption, err := p.encryption()
	if err != nil {
		return err
	}
	iv := make([]byte, encryption.NonceSize())
	if _, err = rand.Read(iv); err != nil {
		return err
	}
	payload, err := json.Marshal(sealed{iv, encryption.Seal(nil, iv, plaintext, p.binding())})
	if err != nil {
		return err
	}
	if err = os.MkdirAll(p.cacheDir, 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(p.cacheDir, "cache-*")
	if err != nil {
		return err
	}
	name := file.Name()
	defer os.Remove(name)
	if _, err = file.Write(payload); err != nil {
		file.Close()
		return err
	}
	if err = file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	return os.Rename(name, p.cacheFile())
}
func (p *Plugin) readCache() (response, error) {
	file, err := os.Open(p.cacheFile())
	if err != nil {
		return response{}, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 6*1024*1024+1))
	if err != nil {
		return response{}, err
	}
	if len(data) > 6*1024*1024 {
		return response{}, fmt.Errorf("cache exceeds size limit")
	}
	var payload sealed
	if err = bsb.DecodeJSON(data, &payload); err != nil {
		return response{}, err
	}
	encryption, err := p.encryption()
	if err != nil {
		return response{}, err
	}
	if len(payload.IV) != encryption.NonceSize() {
		return response{}, fmt.Errorf("invalid cache nonce")
	}
	plaintext, err := encryption.Open(nil, payload.IV, payload.Data, p.binding())
	if err != nil {
		return response{}, err
	}
	var saved cached
	if err = bsb.DecodeJSON(plaintext, &saved); err != nil {
		return response{}, err
	}
	age := time.Since(saved.FetchedAt)
	if age < 0 || age > p.stale {
		return response{}, fmt.Errorf("Vault cache expired")
	}
	return saved.Response, nil
}

func applyOverrides(document map[string]any, profile, raw string) error {
	if raw == "" {
		return nil
	}
	if len(raw) > 128*1024 {
		return fmt.Errorf("overrides exceed size limit")
	}
	var patch map[string]any
	if err := bsb.DecodeJSON([]byte(raw), &patch); err != nil || patch == nil {
		return fmt.Errorf("overrides must be an object")
	}
	nodes := 0
	var safe func(any, int) error
	safe = func(value any, depth int) error {
		nodes++
		if nodes > 10000 || depth > 64 {
			return fmt.Errorf("overrides exceed complexity limit")
		}
		switch v := value.(type) {
		case map[string]any:
			for key, child := range v {
				if key == "__proto__" || key == "prototype" || key == "constructor" {
					return fmt.Errorf("forbidden override key")
				}
				if err := safe(child, depth+1); err != nil {
					return err
				}
			}
		case []any:
			for _, child := range v {
				if err := safe(child, depth+1); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := safe(patch, 0); err != nil {
		return err
	}
	selected, _ := document[profile].(map[string]any)
	for group, rawPlugins := range patch {
		if group != "services" && group != "events" && group != "observable" {
			return fmt.Errorf("invalid override group")
		}
		plugins, ok := rawPlugins.(map[string]any)
		if !ok {
			return fmt.Errorf("invalid override plugins")
		}
		entries, _ := selected[group].(map[string]any)
		for name, rawPatch := range plugins {
			fields, ok := rawPatch.(map[string]any)
			if !ok {
				return fmt.Errorf("invalid plugin override")
			}
			entry, ok := entries[name].(map[string]any)
			if !ok {
				return fmt.Errorf("unknown override plugin %s", name)
			}
			allowed, ok := entry["envOverridePaths"].([]any)
			if !ok {
				return fmt.Errorf("overrides not permitted for %s", name)
			}
			paths := map[string]bool{}
			for _, path := range allowed {
				s, ok := path.(string)
				if !ok {
					return fmt.Errorf("invalid override policy")
				}
				paths[s] = true
			}
			var validate func(map[string]any, string) error
			validate = func(values map[string]any, prefix string) error {
				for key, value := range values {
					path := prefix + key
					if paths[path] {
						continue
					}
					child, ok := value.(map[string]any)
					if !ok || len(child) == 0 {
						return fmt.Errorf("override path not permitted: %s.%s", name, path)
					}
					if err := validate(child, path+"."); err != nil {
						return err
					}
				}
				return nil
			}
			if err := validate(fields, ""); err != nil {
				return err
			}
			base, _ := entry["config"].(map[string]any)
			entry["config"] = bsb.MergeConfig(base, fields)
		}
	}
	return nil
}
