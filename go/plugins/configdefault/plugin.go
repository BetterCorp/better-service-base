// Package configdefault provides the default file-based configuration plugin.
// It reads from sec-config.json or sec-config.yaml (configurable via BSB_CONFIG_FILE env).
// Supports deployment profiles via BSB_PROFILE env variable.
package configdefault

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/bettercorp/service-base/go/bsb"
)

// Plugin implements bsb.ConfigPlugin with file-based configuration.
type Plugin struct {
	cwd        string
	configFile string
	profile    string
	data       profileConfig
}

type profileConfig struct {
	Observable map[string]pluginEntry `json:"observable"`
	Events     map[string]pluginEntry `json:"events"`
	Services   map[string]pluginEntry `json:"services"`
}

type pluginEntry struct {
	Plugin  string         `json:"plugin"`
	Enabled *bool          `json:"enabled"`
	Version string         `json:"version"`
	Config  map[string]any `json:"config"`
}

// New creates a new config-default plugin.
func New(config map[string]any) (bsb.ConfigPlugin, error) {
	p := &Plugin{
		cwd:     ".",
		profile: "default",
	}
	if v, ok := config["cwd"]; ok {
		if s, ok := v.(string); ok {
			p.cwd = s
		}
	}
	if v, ok := config["configFile"]; ok {
		if s, ok := v.(string); ok {
			p.configFile = s
		}
	}
	// Check environment overrides
	if env := os.Getenv("BSB_CONFIG_FILE"); env != "" && p.configFile == "" {
		p.configFile = env
	}
	if env := os.Getenv("BSB_PROFILE"); env != "" {
		p.profile = env
	}
	return p, nil
}

// Init loads the configuration file.
func (p *Plugin) Init(_ context.Context, obs bsb.Observable) error {
	obs.Log().Info("config-default: initializing")

	configPath := p.resolveConfigPath()
	obs.Log().Debug("config-default: loading config", map[string]any{
		"path":    configPath,
		"profile": p.profile,
	})

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			obs.Log().Warn("config-default: config file not found, using empty config", map[string]any{
				"path": configPath,
			})
			p.data = profileConfig{
				Observable: make(map[string]pluginEntry),
				Events:     make(map[string]pluginEntry),
				Services:   make(map[string]pluginEntry),
			}
			return nil
		}
		return fmt.Errorf("config-default: failed to read config: %w", err)
	}

	// Parse JSON (we support JSON format; YAML would need a dependency)
	var rawConfig map[string]json.RawMessage
	if err := json.Unmarshal(data, &rawConfig); err != nil {
		return fmt.Errorf("config-default: failed to parse config: %w", err)
	}

	// Try to get the profile
	profileData, ok := rawConfig[p.profile]
	if !ok {
		// If no profile key, try using the root directly
		if err := json.Unmarshal(data, &p.data); err != nil {
			return fmt.Errorf("config-default: failed to parse profile config: %w", err)
		}
	} else {
		if err := json.Unmarshal(profileData, &p.data); err != nil {
			return fmt.Errorf("config-default: failed to parse profile %q: %w", p.profile, err)
		}
	}

	// Initialize nil maps
	if p.data.Observable == nil {
		p.data.Observable = make(map[string]pluginEntry)
	}
	if p.data.Events == nil {
		p.data.Events = make(map[string]pluginEntry)
	}
	if p.data.Services == nil {
		p.data.Services = make(map[string]pluginEntry)
	}

	obs.Log().Info("config-default: loaded", map[string]any{
		"observableCount": len(p.data.Observable),
		"eventsCount":     len(p.data.Events),
		"servicesCount":   len(p.data.Services),
	})

	return nil
}

// Run is a no-op for config plugins.
func (p *Plugin) Run(_ context.Context, _ bsb.Observable) error { return nil }

// Dispose is a no-op for config plugins.
func (p *Plugin) Dispose() error { return nil }

// GetServicePlugins returns enabled service plugin definitions.
func (p *Plugin) GetServicePlugins(_ context.Context, _ bsb.Observable) (map[string]bsb.PluginDefinition, error) {
	return p.toPluginDefs(p.data.Services), nil
}

// GetEventsPlugins returns enabled events plugin definitions.
func (p *Plugin) GetEventsPlugins(_ context.Context, _ bsb.Observable) (map[string]bsb.PluginDefinition, error) {
	return p.toPluginDefs(p.data.Events), nil
}

// GetObservablePlugins returns enabled observable plugin definitions.
func (p *Plugin) GetObservablePlugins(_ context.Context, _ bsb.Observable) (map[string]bsb.PluginDefinition, error) {
	return p.toPluginDefs(p.data.Observable), nil
}

// GetPluginConfig returns the raw config map for a specific plugin.
func (p *Plugin) GetPluginConfig(_ context.Context, _ bsb.Observable, pluginType bsb.PluginType, pluginName string) (map[string]any, error) {
	var entries map[string]pluginEntry
	switch pluginType {
	case bsb.PluginTypeObservable:
		entries = p.data.Observable
	case bsb.PluginTypeEvents:
		entries = p.data.Events
	case bsb.PluginTypeService:
		entries = p.data.Services
	default:
		return nil, fmt.Errorf("unknown plugin type: %s", pluginType)
	}

	if entry, ok := entries[pluginName]; ok {
		return entry.Config, nil
	}
	return nil, nil
}

// GetServicePluginDefinition returns the resolved definition for a service.
func (p *Plugin) GetServicePluginDefinition(_ context.Context, _ bsb.Observable, pluginName string) (*bsb.ServicePluginDefinition, error) {
	entry, ok := p.data.Services[pluginName]
	if !ok {
		return &bsb.ServicePluginDefinition{Name: pluginName, Enabled: false}, nil
	}
	name := entry.Plugin
	if name == "" {
		name = pluginName
	}
	enabled := true
	if entry.Enabled != nil {
		enabled = *entry.Enabled
	}
	return &bsb.ServicePluginDefinition{Name: name, Enabled: enabled}, nil
}

func (p *Plugin) toPluginDefs(entries map[string]pluginEntry) map[string]bsb.PluginDefinition {
	result := make(map[string]bsb.PluginDefinition, len(entries))
	for name, entry := range entries {
		enabled := true
		if entry.Enabled != nil {
			enabled = *entry.Enabled
		}
		pluginName := entry.Plugin
		if pluginName == "" {
			pluginName = name
		}
		result[name] = bsb.PluginDefinition{
			Plugin:  pluginName,
			Enabled: enabled,
			Version: entry.Version,
			Config:  entry.Config,
		}
	}
	return result
}

func (p *Plugin) resolveConfigPath() string {
	if p.configFile != "" {
		if filepath.IsAbs(p.configFile) {
			return p.configFile
		}
		return filepath.Join(p.cwd, p.configFile)
	}
	// Try sec-config.json first, then sec-config.yaml
	jsonPath := filepath.Join(p.cwd, "sec-config.json")
	if _, err := os.Stat(jsonPath); err == nil {
		return jsonPath
	}
	yamlPath := filepath.Join(p.cwd, "sec-config.yaml")
	if _, err := os.Stat(yamlPath); err == nil {
		return yamlPath
	}
	// Try .json extensions with "bsb" prefix
	for _, name := range []string{"bsb-config.json", "bsb-config.yaml"} {
		path := filepath.Join(p.cwd, name)
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return jsonPath // default to sec-config.json even if not found
}

// Register registers the config-default plugin with the given registry.
func Register(registry *bsb.PluginRegistry) {
	registry.RegisterConfig("config-default", func(config map[string]any) (bsb.ConfigPlugin, error) {
		return New(config)
	})
}

// CategoryFromPluginName infers the plugin category from its name prefix.
func CategoryFromPluginName(name string) string {
	prefixes := map[string]string{
		"service-":    "service",
		"observable-": "observable",
		"events-":     "events",
		"config-":     "config",
	}
	for prefix, category := range prefixes {
		if strings.HasPrefix(name, prefix) {
			return category
		}
	}
	return "other"
}
