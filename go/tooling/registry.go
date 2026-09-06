package tooling

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
)

var pluginIDPattern = regexp.MustCompile(`^@?[A-Za-z0-9_][A-Za-z0-9._-]*(/@?[A-Za-z0-9_][A-Za-z0-9._-]*)?$`)
var versionPattern = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?(\+[A-Za-z0-9.-]+)?$`)

func ParsePluginID(id string) (string, string, error) {
	if len(id) > 200 || !pluginIDPattern.MatchString(id) {
		return "", "", fmt.Errorf("invalid plugin ID")
	}
	parts := strings.Split(id, "/")
	if len(parts) == 1 {
		return "_", parts[0], nil
	}
	return parts[0], parts[1], nil
}
func language(value string) (string, error) {
	if value == "dotnet" {
		value = "csharp"
	}
	switch value {
	case "nodejs", "csharp", "python", "go", "rust", "java":
		return value, nil
	}
	return "", fmt.Errorf("unsupported implementation language")
}

type Registry struct{ Origin, Token string }

func NewRegistry(endpoint, token string, allowHTTP bool) (*Registry, error) {
	if endpoint == "" {
		endpoint = os.Getenv("BSB_REGISTRY_URL")
	}
	if endpoint == "" {
		endpoint = "https://io.bsbcode.dev"
	}
	origin, err := bsb.EndpointOrigin(endpoint, allowHTTP)
	if err != nil {
		return nil, err
	}
	if token == "" {
		token = os.Getenv("BSB_REGISTRY_TOKEN")
	}
	return &Registry{origin, token}, nil
}
func (r *Registry) Request(ctx context.Context, method, path string, body any) (map[string]any, error) {
	if !strings.HasPrefix(path, "/") || strings.HasPrefix(path, "//") {
		return nil, fmt.Errorf("request requires relative API path")
	}
	headers := map[string]string{}
	if r.Token != "" {
		headers["Authorization"] = "Bearer " + r.Token
	}
	result := map[string]any{}
	err := bsb.JSONRequest(ctx, method, r.Origin+path, body, headers, 10*time.Second, &result)
	return result, err
}
func (r *Registry) ResolveLanguage(ctx context.Context, id, source string) (string, error) {
	if source != "" {
		return language(source)
	}
	org, name, err := ParsePluginID(id)
	if err != nil {
		return "", err
	}
	result, err := r.Request(ctx, http.MethodGet, "/plugins/"+url.PathEscape(org)+"/"+url.PathEscape(name)+"/implementations", nil)
	if err != nil {
		return "", err
	}
	entries, ok := result["implementations"].([]any)
	if !ok || len(entries) != 1 {
		return "", fmt.Errorf("specify --source-language when no unique implementation is available")
	}
	entry, ok := entries[0].(map[string]any)
	if !ok {
		return "", fmt.Errorf("invalid implementation response")
	}
	value, _ := entry["language"].(string)
	return language(value)
}
func (r *Registry) Info(ctx context.Context, id, source string) (map[string]any, error) {
	org, name, err := ParsePluginID(id)
	if err != nil {
		return nil, err
	}
	source, err = r.ResolveLanguage(ctx, id, source)
	if err != nil {
		return nil, err
	}
	return r.Request(ctx, http.MethodGet, "/plugins/"+url.PathEscape(org)+"/"+url.PathEscape(name)+"?language="+source, nil)
}
func (r *Registry) Schema(ctx context.Context, id, source, version string) (map[string]any, error) {
	org, name, err := ParsePluginID(id)
	if err != nil {
		return nil, err
	}
	source, err = r.ResolveLanguage(ctx, id, source)
	if err != nil {
		return nil, err
	}
	if version == "" {
		info, err := r.Info(ctx, id, source)
		if err != nil {
			return nil, err
		}
		if plugin, ok := info["plugin"].(map[string]any); ok {
			info = plugin
		}
		version, _ = info["version"].(string)
	}
	if !versionPattern.MatchString(version) {
		return nil, fmt.Errorf("an exact semantic version is required")
	}
	schema, err := r.Request(ctx, http.MethodGet, "/plugins/"+url.PathEscape(org)+"/"+url.PathEscape(name)+"/"+url.PathEscape(version)+"/schema?language="+source, nil)
	if err != nil {
		return nil, err
	}
	schema["pluginId"] = name
	schema["source"] = map[string]any{"org": org, "name": name, "language": source, "version": version, "registry": r.Origin}
	return schema, nil
}
func (r *Registry) Install(ctx context.Context, cwd, id, source, version string) ([]string, error) {
	schema, err := r.Schema(ctx, id, source, version)
	if err != nil {
		return nil, err
	}
	org, name, _ := ParsePluginID(id)
	source = schema["source"].(map[string]any)["language"].(string)
	local := org + "~" + name + "~" + source
	data, err := json.MarshalIndent(schema, "", "  ")
	if err != nil {
		return nil, err
	}
	if _, err = GenerateClient(data, local); err != nil {
		return nil, err
	}
	directory := filepath.Join(cwd, ".bsb", "schemas")
	if err = os.MkdirAll(directory, 0755); err != nil {
		return nil, err
	}
	if err = os.WriteFile(filepath.Join(directory, local+".json"), data, 0644); err != nil {
		return nil, err
	}
	return SyncClients(cwd)
}
func (r *Registry) Publish(ctx context.Context, cwd, org, selected string, vault bool) ([]map[string]any, error) {
	if r.Token == "" {
		return nil, fmt.Errorf("BSB_REGISTRY_TOKEN or --token is required")
	}
	if org == "" {
		org = "_"
	}
	if _, _, err := ParsePluginID(org + "/check"); err != nil {
		return nil, err
	}
	if _, err := BuildHost(ctx, cwd); err != nil {
		return nil, err
	}
	var manifest Manifest
	data, err := os.ReadFile(filepath.Join(cwd, "bsb-plugin.json"))
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(data, &manifest); err != nil {
		return nil, err
	}
	results := []map[string]any{}
	for _, entry := range manifest.Go {
		if selected != "" && entry.ID != selected {
			continue
		}
		data, err := os.ReadFile(filepath.Join(cwd, "lib", "schemas", entry.ID+".json"))
		if err != nil {
			return nil, err
		}
		var exported map[string]any
		if err = json.Unmarshal(data, &exported); err != nil {
			return nil, err
		}
		version, _ := exported["version"].(string)
		if !versionPattern.MatchString(version) {
			return nil, fmt.Errorf("invalid package version for %s", entry.ID)
		}
		metadata := map[string]any{"displayName": entry.ID, "description": exported["description"], "category": exported["category"], "tags": []string{}}
		for _, field := range []string{"author", "license", "homepage", "repository", "tags"} {
			if value := exported[field]; value != nil && value != "" {
				metadata[field] = value
			}
		}
		contract := map[string]any{"pluginName": entry.ID, "version": version, "events": exported["events"]}
		if capabilities := exported["capabilities"]; capabilities != nil {
			contract["capabilities"] = capabilities
		}
		body := map[string]any{"org": org, "name": entry.ID, "version": version, "language": "go", "metadata": metadata, "eventSchema": contract, "package": map[string]any{"go": entry.Package}, "visibility": "public"}
		if schema := exported["configSchema"]; schema != nil {
			body["configSchema"] = schema
		}
		path := "/plugins"
		if vault {
			path = "/api/plugins/publish"
			contract["pluginId"] = entry.ID
		} else {
			paths, _ := exported["documentation"].([]any)
			if len(paths) == 0 {
				paths = []any{"README.md"}
			}
			if len(paths) > 20 {
				return nil, fmt.Errorf("at most 20 documentation files are allowed")
			}
			docs := []string{}
			for _, value := range paths {
				file, ok := value.(string)
				if !ok {
					return nil, fmt.Errorf("invalid documentation filename")
				}
				if !filepath.IsAbs(file) {
					file = filepath.Join(cwd, file)
				}
				contents, err := os.ReadFile(file)
				if err != nil {
					return nil, err
				}
				if len(contents) > 1000000 || strings.TrimSpace(string(contents)) == "" {
					return nil, fmt.Errorf("documentation must contain 1..1000000 bytes")
				}
				docs = append(docs, string(contents))
			}
			body["documentation"] = docs
		}
		result, err := r.Request(ctx, http.MethodPost, path, body)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	if len(results) == 0 {
		return nil, fmt.Errorf("no matching Go plugins to publish")
	}
	return results, nil
}
