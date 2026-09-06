package bsb

import (
	"context"
	"fmt"
)

// ObservableController manages observable plugin instances.
type ObservableController struct {
	backend  *ObservableBackend
	registry *PluginRegistry
	opts     BSBOptions
	plugins  []ObservablePlugin
}

// Init loads and initializes observable plugins from config.
func (oc *ObservableController) Init(ctx context.Context, obs Observable, config *ConfigController) error {
	obs.Log().Info("loading observable plugins")

	pluginDefs, err := config.GetObservablePlugins(ctx, obs)
	if err != nil {
		return fmt.Errorf("load observable configuration: %w", err)
	}

	for _, name := range sortedPluginNames(pluginDefs) {
		def := pluginDefs[name]
		if !def.Enabled {
			obs.Log().Debug("skipping disabled observable plugin", map[string]any{"plugin": name})
			continue
		}

		pluginName := def.Plugin
		if pluginName == "" {
			pluginName = name
		}

		if !oc.registry.HasPlugin(PluginTypeObservable, pluginName) {
			return fmt.Errorf("enabled observable plugin %q is not linked into this BSB host", pluginName)
		}

		pluginConfig, err := config.GetPluginConfig(ctx, obs, PluginTypeObservable, name)
		if err != nil {
			return fmt.Errorf("observable %q configuration: %w", pluginName, err)
		}

		plugin, err := oc.registry.CreateObservable(pluginName, pluginConfig)
		if err != nil {
			return fmt.Errorf("failed to create observable plugin %q: %w", pluginName, err)
		}

		oc.plugins = append(oc.plugins, plugin)
		if err := plugin.Init(ctx, obs); err != nil {
			return fmt.Errorf("failed to init observable plugin %q: %w", pluginName, err)
		}

		oc.backend.AddPlugin(plugin)
		obs.Log().Info("observable plugin loaded", map[string]any{"plugin": name})
	}

	return nil
}

// Run starts all observable plugins.
func (oc *ObservableController) Run(ctx context.Context, obs Observable) error {
	for _, plugin := range oc.plugins {
		if err := plugin.Run(ctx, obs); err != nil {
			return fmt.Errorf("observable plugin run failed: %w", err)
		}
	}
	return nil
}

// Dispose cleans up all observable plugins.
func (oc *ObservableController) Dispose() error {
	var errs []error
	// Dispose in reverse order
	for i := len(oc.plugins) - 1; i >= 0; i-- {
		if err := oc.plugins[i].Dispose(); err != nil {
			errs = append(errs, err)
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("observable dispose errors: %v", errs)
	}
	return nil
}
