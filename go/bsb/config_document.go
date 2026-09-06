package bsb

import (
	"context"
	"encoding/json"
	"fmt"
)

// JSONConfig is shared by file, environment and Vault providers.
type JSONConfig struct {
	groups map[string]map[string]PluginDefinition
}

func MergeConfig(base, overlay map[string]any) map[string]any {
	result := make(map[string]any, len(base))
	for key, value := range base {
		result[key] = value
	}
	for key, value := range overlay {
		child, a := result[key].(map[string]any)
		patch, b := value.(map[string]any)
		if a && b {
			result[key] = MergeConfig(child, patch)
		} else {
			result[key] = value
		}
	}
	return result
}

func (p *JSONConfig) LoadDocument(data []byte, profile string) error {
	var document map[string]any
	if err := DecodeJSON(data, &document); err != nil {
		return fmt.Errorf("invalid configuration: %w", err)
	}
	if document == nil {
		return fmt.Errorf("configuration must be an object")
	}
	if profile == "" {
		profile = "default"
	}
	selected := document
	_, services := document["services"]
	_, events := document["events"]
	_, observable := document["observable"]
	if services || events || observable {
		if profile != "default" {
			profiles, _ := document["profiles"].(map[string]any)
			overlay, ok := profiles[profile].(map[string]any)
			if !ok {
				return fmt.Errorf("unknown deployment profile %q", profile)
			}
			selected = MergeConfig(document, overlay)
		}
	} else {
		overlay, ok := document[profile].(map[string]any)
		if !ok {
			return fmt.Errorf("unknown deployment profile %q", profile)
		}
		base, _ := document["default"].(map[string]any)
		selected = MergeConfig(base, overlay)
	}
	if language, exists := selected["language"]; exists && language != "go" {
		return fmt.Errorf("deployment profile must target go")
	}
	groups := map[string]map[string]PluginDefinition{}
	for _, group := range []string{"services", "events", "observable"} {
		groups[group] = map[string]PluginDefinition{}
		section, exists := selected[group]
		if !exists {
			continue
		}
		entries, ok := section.(map[string]any)
		if !ok {
			return fmt.Errorf("%s must be an object", group)
		}
		for name, raw := range entries {
			entry, ok := raw.(map[string]any)
			if !ok || name == "" {
				return fmt.Errorf("invalid plugin definition in %s", group)
			}
			enabled := true
			if value, exists := entry["enabled"]; exists {
				enabled, ok = value.(bool)
				if !ok {
					return fmt.Errorf("%s.enabled must be boolean", name)
				}
			}
			if language, exists := entry["language"]; exists && enabled && language != "go" {
				return fmt.Errorf("enabled plugin %s must target go", name)
			}
			plugin := name
			if value, exists := entry["plugin"]; exists {
				plugin, ok = value.(string)
				if !ok || plugin == "" {
					return fmt.Errorf("invalid plugin identity for %s", name)
				}
			}
			config := map[string]any{}
			if value := entry["config"]; value != nil {
				config, ok = value.(map[string]any)
				if !ok {
					return fmt.Errorf("%s.config must be an object", name)
				}
			}
			version, _ := entry["version"].(string)
			pkg, _ := entry["package"].(string)
			groups[group][name] = PluginDefinition{Plugin: plugin, Enabled: enabled, Config: config, Version: version, Package: pkg}
		}
	}
	p.groups = groups
	return nil
}

func (p *JSONConfig) Run(context.Context, Observable) error { return nil }
func (p *JSONConfig) Dispose() error                        { return nil }
func (p *JSONConfig) definitions(group string) (map[string]PluginDefinition, error) {
	if p.groups == nil {
		return nil, fmt.Errorf("configuration not loaded")
	}
	result := map[string]PluginDefinition{}
	for name, entry := range p.groups[group] {
		result[name] = entry
	}
	return result, nil
}
func (p *JSONConfig) GetServicePlugins(context.Context, Observable) (map[string]PluginDefinition, error) {
	return p.definitions("services")
}
func (p *JSONConfig) GetEventsPlugins(context.Context, Observable) (map[string]PluginDefinition, error) {
	return p.definitions("events")
}
func (p *JSONConfig) GetObservablePlugins(context.Context, Observable) (map[string]PluginDefinition, error) {
	return p.definitions("observable")
}
func (p *JSONConfig) GetPluginConfig(_ context.Context, _ Observable, kind PluginType, name string) (map[string]any, error) {
	group := string(kind)
	if kind == PluginTypeService {
		group = "services"
	}
	entries, err := p.definitions(group)
	if err != nil {
		return nil, err
	}
	entry, ok := entries[name]
	if !ok {
		return nil, fmt.Errorf("unknown plugin %s", name)
	}
	// Factories must not mutate the shared deployment configuration.
	data, err := json.Marshal(entry.Config)
	if err != nil {
		return nil, err
	}
	var result map[string]any
	err = DecodeJSON(data, &result)
	return result, err
}
func (p *JSONConfig) GetServicePluginDefinition(_ context.Context, _ Observable, name string) (*ServicePluginDefinition, error) {
	entries, err := p.definitions("services")
	if err != nil {
		return nil, err
	}
	if entry, ok := entries[name]; ok {
		return &ServicePluginDefinition{Name: name, Enabled: entry.Enabled}, nil
	}
	var found *ServicePluginDefinition
	for alias, entry := range entries {
		if entry.Plugin != name {
			continue
		}
		if found != nil {
			return nil, fmt.Errorf("ambiguous service reference %s; use its profile alias", name)
		}
		found = &ServicePluginDefinition{Name: alias, Enabled: entry.Enabled}
	}
	if found == nil {
		return nil, fmt.Errorf("unknown service reference %s", name)
	}
	return found, nil
}
