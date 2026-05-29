package bsb

import (
	"context"
	"fmt"
)

// EventsController manages events plugin instances and routes event calls.
type EventsController struct {
	backend  *ObservableBackend
	registry *PluginRegistry
	opts     BSBOptions
	plugins  []EventsPlugin
	primary  EventsPlugin // The primary (default) events plugin
}

// Init loads and initializes events plugins from config.
func (ec *EventsController) Init(ctx context.Context, obs Observable, config *ConfigController) error {
	obs.Log().Info("loading events plugins")

	pluginDefs, err := config.GetEventsPlugins(ctx, obs)
	if err != nil {
		obs.Log().Warn("no events plugins in config, using defaults", map[string]any{
			"error": err.Error(),
		})
	}

	// Always ensure events-default is loaded as fallback
	defaultLoaded := false
	for name, def := range pluginDefs {
		if !def.Enabled {
			continue
		}

		pluginName := def.Plugin
		if pluginName == "" {
			pluginName = name
		}

		if !ec.registry.HasPlugin(PluginTypeEvents, pluginName) {
			obs.Log().Warn("events plugin not registered, skipping", map[string]any{"plugin": pluginName})
			continue
		}

		pluginConfig, err := config.GetPluginConfig(ctx, obs, PluginTypeEvents, name)
		if err != nil {
			pluginConfig = def.Config
		}

		plugin, err := ec.registry.CreateEvents(pluginName, pluginConfig)
		if err != nil {
			return fmt.Errorf("failed to create events plugin %q: %w", pluginName, err)
		}

		if err := plugin.Init(ctx, obs); err != nil {
			return fmt.Errorf("failed to init events plugin %q: %w", pluginName, err)
		}

		ec.plugins = append(ec.plugins, plugin)
		if ec.primary == nil {
			ec.primary = plugin
		}
		if pluginName == "events-default" {
			defaultLoaded = true
		}

		obs.Log().Info("events plugin loaded", map[string]any{"plugin": name})
	}

	// If no events plugin was loaded, try to create the default
	if ec.primary == nil && !defaultLoaded {
		if ec.registry.HasPlugin(PluginTypeEvents, "events-default") {
			plugin, err := ec.registry.CreateEvents("events-default", nil)
			if err != nil {
				return fmt.Errorf("failed to create default events plugin: %w", err)
			}
			if err := plugin.Init(ctx, obs); err != nil {
				return fmt.Errorf("failed to init default events plugin: %w", err)
			}
			ec.plugins = append(ec.plugins, plugin)
			ec.primary = plugin
			obs.Log().Info("loaded fallback events-default plugin")
		}
	}

	if ec.primary == nil {
		return fmt.Errorf("no events plugin available")
	}

	return nil
}

// Primary returns the primary events plugin for use by service plugins.
func (ec *EventsController) Primary() EventsPlugin {
	return ec.primary
}

// Run starts all events plugins.
func (ec *EventsController) Run(ctx context.Context, obs Observable) error {
	for _, plugin := range ec.plugins {
		if err := plugin.Run(ctx, obs); err != nil {
			return fmt.Errorf("events plugin run failed: %w", err)
		}
	}
	return nil
}

// Dispose cleans up all events plugins.
func (ec *EventsController) Dispose() error {
	var errs []error
	for i := len(ec.plugins) - 1; i >= 0; i-- {
		if err := ec.plugins[i].Dispose(); err != nil {
			errs = append(errs, err)
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("events dispose errors: %v", errs)
	}
	return nil
}
