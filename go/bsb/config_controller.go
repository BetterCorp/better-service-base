package bsb

import (
	"context"
	"fmt"
	"os"
)

// ConfigController manages the config plugin lifecycle.
type ConfigController struct {
	backend  *ObservableBackend
	registry *PluginRegistry
	opts     BSBOptions
	plugin   ConfigPlugin
}

// Init loads and initializes the config plugin.
func (cc *ConfigController) Init(ctx context.Context, obs Observable) error {
	pluginName := cc.opts.ConfigPlugin
	obs.Log().Info("loading config plugin", map[string]any{"plugin": pluginName})

	// Check for config file override from environment
	configFile := cc.opts.ConfigFile
	if configFile == "" {
		configFile = os.Getenv("BSB_CONFIG_FILE")
	}

	config := map[string]any{
		"cwd": cc.opts.Cwd,
	}
	if configFile != "" {
		config["configFile"] = configFile
	}

	plugin, err := cc.registry.CreateConfig(pluginName, config)
	if err != nil {
		return fmt.Errorf("failed to create config plugin %q: %w", pluginName, err)
	}

	if err := plugin.Init(ctx, obs); err != nil {
		return fmt.Errorf("failed to init config plugin %q: %w", pluginName, err)
	}

	cc.plugin = plugin
	obs.Log().Info("config plugin initialized", map[string]any{"plugin": pluginName})
	return nil
}

// GetServicePlugins returns enabled service plugins from config.
func (cc *ConfigController) GetServicePlugins(ctx context.Context, obs Observable) (map[string]PluginDefinition, error) {
	if cc.plugin == nil {
		return nil, fmt.Errorf("config plugin not initialized")
	}
	return cc.plugin.GetServicePlugins(ctx, obs)
}

// GetEventsPlugins returns enabled events plugins from config.
func (cc *ConfigController) GetEventsPlugins(ctx context.Context, obs Observable) (map[string]PluginDefinition, error) {
	if cc.plugin == nil {
		return nil, fmt.Errorf("config plugin not initialized")
	}
	return cc.plugin.GetEventsPlugins(ctx, obs)
}

// GetObservablePlugins returns enabled observable plugins from config.
func (cc *ConfigController) GetObservablePlugins(ctx context.Context, obs Observable) (map[string]PluginDefinition, error) {
	if cc.plugin == nil {
		return nil, fmt.Errorf("config plugin not initialized")
	}
	return cc.plugin.GetObservablePlugins(ctx, obs)
}

// GetPluginConfig returns the raw config for a specific plugin.
func (cc *ConfigController) GetPluginConfig(ctx context.Context, obs Observable, pluginType PluginType, pluginName string) (map[string]any, error) {
	if cc.plugin == nil {
		return nil, fmt.Errorf("config plugin not initialized")
	}
	return cc.plugin.GetPluginConfig(ctx, obs, pluginType, pluginName)
}

// GetServicePluginDefinition returns the resolved plugin definition.
func (cc *ConfigController) GetServicePluginDefinition(ctx context.Context, obs Observable, pluginName string) (*ServicePluginDefinition, error) {
	if cc.plugin == nil {
		return nil, fmt.Errorf("config plugin not initialized")
	}
	return cc.plugin.GetServicePluginDefinition(ctx, obs, pluginName)
}

// Dispose cleans up the config plugin.
func (cc *ConfigController) Dispose() error {
	if cc.plugin == nil {
		return nil
	}
	return cc.plugin.Dispose()
}
