package bsb

import (
	"context"
	"fmt"
	"reflect"
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
		return fmt.Errorf("load events configuration: %w", err)
	}

	// Always ensure events-default is loaded as fallback
	router := &eventRouter{}
	unfiltered := false
	for _, name := range sortedPluginNames(pluginDefs) {
		def := pluginDefs[name]
		if !def.Enabled {
			continue
		}
		if err := validateEventFilter(def.Filter); err != nil {
			return fmt.Errorf("events %s: %w", name, err)
		}

		pluginName := def.Plugin
		if pluginName == "" {
			pluginName = name
		}

		if !ec.registry.HasPlugin(PluginTypeEvents, pluginName) {
			return fmt.Errorf("enabled events plugin %q is not linked into this BSB host", pluginName)
		}

		pluginConfig, err := config.GetPluginConfig(ctx, obs, PluginTypeEvents, name)
		if err != nil {
			return fmt.Errorf("events %q configuration: %w", pluginName, err)
		}

		plugin, err := ec.registry.CreateEvents(pluginName, pluginConfig)
		if err != nil {
			return fmt.Errorf("failed to create events plugin %q: %w", pluginName, err)
		}

		ec.plugins = append(ec.plugins, plugin)
		router.routes = append(router.routes, eventRoute{plugin, def.Filter})
		if err := plugin.Init(ctx, obs); err != nil {
			return fmt.Errorf("failed to init events plugin %q: %w", pluginName, err)
		}

		if def.Filter == nil {
			unfiltered = true
		}

		obs.Log().Info("events plugin loaded", map[string]any{"plugin": name})
	}

	// If no events plugin was loaded, try to create the default
	if !unfiltered {
		if ec.registry.HasPlugin(PluginTypeEvents, "events-default") {
			plugin, err := ec.registry.CreateEvents("events-default", nil)
			if err != nil {
				return fmt.Errorf("failed to create default events plugin: %w", err)
			}
			ec.plugins = append(ec.plugins, plugin)
			if err := plugin.Init(ctx, obs); err != nil {
				return fmt.Errorf("failed to init default events plugin: %w", err)
			}
			router.routes = append(router.routes, eventRoute{plugin, nil})
			obs.Log().Info("loaded fallback events-default plugin")
		}
	}

	if len(router.routes) == 0 {
		return fmt.Errorf("no events plugin available")
	}
	ec.primary = router

	return nil
}

// Primary returns the primary events plugin for use by service plugins.
func (ec *EventsController) Primary() EventsPlugin {
	return ec.primary
}

// Wait monitors every concrete backend, including filtered and non-primary routes.
func (ec *EventsController) Wait(ctx context.Context) error {
	cases := []reflect.SelectCase{{Dir: reflect.SelectRecv, Chan: reflect.ValueOf(ctx.Done())}}
	for _, plugin := range ec.plugins {
		if source, ok := plugin.(interface{ Failure() <-chan error }); ok {
			cases = append(cases, reflect.SelectCase{Dir: reflect.SelectRecv, Chan: reflect.ValueOf(source.Failure())})
		}
	}
	chosen, value, open := reflect.Select(cases)
	if chosen == 0 {
		return nil
	}
	if !open || value.IsNil() {
		return fmt.Errorf("events backend stopped without an error")
	}
	return value.Interface().(error)
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
