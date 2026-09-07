package tooling

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
)

type HostedOptions struct {
	Plugin, Language, Version string
	AllowHTTP                 bool
}

func hostedOrigin(endpoint string, allowHTTP bool) (string, error) {
	origin, err := bsb.EndpointOrigin(endpoint, allowHTTP)
	if err != nil {
		return "", err
	}
	base, _ := url.Parse(origin)
	if base.Port() == "443" && base.Scheme == "https" || base.Port() == "80" && base.Scheme == "http" {
		base.Host = base.Hostname()
		if strings.Contains(base.Host, ":") {
			base.Host = "[" + base.Host + "]"
		}
		origin = base.String()
	}
	return origin, nil
}
func HostedSchema(ctx context.Context, endpoint string, options HostedOptions) (map[string]any, string, error) {
	origin, err := hostedOrigin(endpoint, options.AllowHTTP)
	if err != nil {
		return nil, "", err
	}
	discovery, _ := url.Parse(origin + "/.well-known/bsb")
	fetch := func(endpoint string) (map[string]any, error) {
		result := map[string]any{}
		err := bsb.JSONRequest(ctx, http.MethodGet, endpoint, nil, nil, 10*time.Second, &result)
		return result, err
	}
	manifest, err := fetch(discovery.String())
	if err != nil {
		return nil, "", err
	}
	revision, ok := manifest["bsb"].(json.Number)
	revisionNumber, revisionErr := revision.Float64()
	if !ok || revisionErr != nil || revisionNumber != 1 {
		return nil, "", fmt.Errorf("invalid BSB discovery version")
	}
	entries, ok := manifest["plugins"].([]any)
	if !ok || len(entries) == 0 || len(entries) > 128 {
		return nil, "", fmt.Errorf("invalid hosted plugins")
	}
	selectedOrg, selectedName := "", ""
	if options.Plugin != "" {
		selectedOrg, selectedName, err = ParsePluginID(options.Plugin)
		if err != nil {
			return nil, "", err
		}
	}
	if options.Language != "" {
		options.Language, err = language(options.Language)
		if err != nil {
			return nil, "", err
		}
	}
	if options.Version != "" && !versionPattern.MatchString(options.Version) {
		return nil, "", fmt.Errorf("exact semantic version required")
	}
	identities := map[string]bool{}
	matches := []map[string]any{}
	for _, raw := range entries {
		entry, ok := raw.(map[string]any)
		if !ok {
			return nil, "", fmt.Errorf("invalid hosted plugin")
		}
		id, _ := entry["id"].(string)
		org, name, err := ParsePluginID(id)
		if err != nil {
			return nil, "", err
		}
		impl, _ := entry["language"].(string)
		impl, err = language(impl)
		if err != nil {
			return nil, "", err
		}
		version, _ := entry["version"].(string)
		if !versionPattern.MatchString(version) {
			return nil, "", fmt.Errorf("invalid hosted version")
		}
		switch entry["schema"].(type) {
		case string, map[string]any:
		default:
			return nil, "", fmt.Errorf("invalid hosted schema reference")
		}
		identity := org + "/" + name + "~" + impl + "~" + version
		if identities[identity] {
			return nil, "", fmt.Errorf("duplicate hosted implementation")
		}
		identities[identity] = true
		if (options.Plugin == "" || (org == selectedOrg && name == selectedName)) && (options.Language == "" || impl == options.Language) && (options.Version == "" || version == options.Version) {
			matches = append(matches, map[string]any{"org": org, "name": name, "language": impl, "version": version, "schema": entry["schema"]})
		}
	}
	if len(matches) != 1 {
		return nil, "", fmt.Errorf("no unique hosted implementation; specify --plugin, --source-language or --version")
	}
	selected := matches[0]
	schema, inline := selected["schema"].(map[string]any)
	if !inline {
		ref, err := url.Parse(selected["schema"].(string))
		if err != nil {
			return nil, "", err
		}
		link := discovery.ResolveReference(ref)
		authority := *link
		authority.Path = ""
		authority.RawPath = ""
		authority.RawQuery = ""
		authority.Fragment = ""
		linkedOrigin, err := hostedOrigin(authority.String(), options.AllowHTTP)
		if err != nil || linkedOrigin != origin || link.User != nil || link.Fragment != "" {
			return nil, "", fmt.Errorf("hosted schema link must remain on the same origin without credentials or fragments")
		}
		schema, err = fetch(link.String())
		if err != nil {
			return nil, "", err
		}
	}
	if _, ok := schema["events"].(map[string]any); !ok {
		return nil, "", fmt.Errorf("hosted schema requires an events object")
	}
	target, exists := schema["pluginId"]
	if !exists {
		target, exists = schema["pluginName"]
	}
	if !exists {
		target = selected["name"]
	}
	wire, ok := target.(string)
	_, name, err := ParsePluginID(wire)
	if !ok || err != nil || name != wire {
		return nil, "", fmt.Errorf("invalid hosted wire plugin ID")
	}
	schema["pluginId"] = wire
	if version, exists := schema["version"]; exists && version != selected["version"] {
		return nil, "", fmt.Errorf("hosted schema version does not match discovery")
	}
	schema["version"] = selected["version"]
	schema["source"] = map[string]any{"url": origin, "org": selected["org"], "name": selected["name"], "language": selected["language"], "version": selected["version"]}
	digest := sha256.Sum256([]byte(origin))
	local := fmt.Sprintf("hosted~%x~%s~%s~%s", digest[:8], selected["org"], selected["name"], selected["language"])
	return schema, local, nil
}

func InstallHosted(ctx context.Context, cwd, endpoint string, options HostedOptions) ([]string, error) {
	schema, local, err := HostedSchema(ctx, endpoint, options)
	if err != nil {
		return nil, err
	}
	return installSchema(cwd, schema, local)
}
