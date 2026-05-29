package bsb

import (
	"context"
	"fmt"
	"sort"
)

// sortedService holds a service plugin with its dependency metadata for ordering.
type sortedService struct {
	name              string
	plugin            ServicePlugin
	initBeforePlugins []string
	initAfterPlugins  []string
	runBeforePlugins  []string
	runAfterPlugins   []string
}

// ServicesController manages service plugin instances with dependency ordering.
type ServicesController struct {
	backend  *ObservableBackend
	registry *PluginRegistry
	opts     BSBOptions
	services []*sortedService
}

// Init loads and initializes service plugins from config.
func (sc *ServicesController) Init(ctx context.Context, obs Observable, config *ConfigController, events *EventsController, backend *ObservableBackend) error {
	obs.Log().Info("loading service plugins")

	pluginDefs, err := config.GetServicePlugins(ctx, obs)
	if err != nil {
		obs.Log().Warn("no service plugins in config", map[string]any{
			"error": err.Error(),
		})
		return nil
	}

	// Load all service plugins
	for name, def := range pluginDefs {
		if !def.Enabled {
			obs.Log().Debug("skipping disabled service", map[string]any{"plugin": name})
			continue
		}

		pluginName := def.Plugin
		if pluginName == "" {
			pluginName = name
		}

		if !sc.registry.HasPlugin(PluginTypeService, pluginName) {
			obs.Log().Warn("service plugin not registered, skipping", map[string]any{"plugin": pluginName})
			continue
		}

		pluginConfig, err := config.GetPluginConfig(ctx, obs, PluginTypeService, name)
		if err != nil {
			obs.Log().Warn("failed to get service plugin config, using definition config", map[string]any{
				"plugin": pluginName,
				"error":  err.Error(),
			})
			pluginConfig = def.Config
		}

		plugin, err := sc.registry.CreateService(pluginName, pluginConfig)
		if err != nil {
			return fmt.Errorf("failed to create service plugin %q: %w", pluginName, err)
		}

		// Wire up the events facade
		meta := plugin.Metadata()
		resource := BuildResourceContext(meta.Name, meta.Version, sc.opts.AppID, sc.opts.Mode, sc.opts.Region)
		pe := NewPluginEvents(name, events.Primary(), backend, resource, NewEventSchemas())
		plugin.SetEvents(pe)
		plugin.SetObservableBackend(backend)

		sc.services = append(sc.services, &sortedService{
			name:              name,
			plugin:            plugin,
			initBeforePlugins: meta.InitBeforePlugins,
			initAfterPlugins:  meta.InitAfterPlugins,
			runBeforePlugins:  meta.RunBeforePlugins,
			runAfterPlugins:   meta.RunAfterPlugins,
		})

		obs.Log().Info("service plugin loaded", map[string]any{"plugin": name})
	}

	// Sort by init dependencies
	sorted, err := topologicalSort(sc.services, true)
	if err != nil {
		return fmt.Errorf("failed to sort service init order: %w", err)
	}
	sc.services = sorted

	// Initialize in dependency order
	for _, svc := range sc.services {
		meta := svc.plugin.Metadata()
		resource := BuildResourceContext(meta.Name, meta.Version, sc.opts.AppID, sc.opts.Mode, sc.opts.Region)
		svcObs := backend.CreateObservable(NewDTrace(), svc.name, resource)

		obs.Log().Debug("initializing service", map[string]any{"plugin": svc.name})
		if err := svc.plugin.Init(ctx, svcObs); err != nil {
			return fmt.Errorf("service %q init failed: %w", svc.name, err)
		}
	}

	obs.Log().Info("all service plugins initialized", map[string]any{
		"count": len(sc.services),
	})
	return nil
}

// Run starts all service plugins in dependency order.
func (sc *ServicesController) Run(ctx context.Context, obs Observable) error {
	// Re-sort by run dependencies
	sorted, err := topologicalSort(sc.services, false)
	if err != nil {
		return fmt.Errorf("failed to sort service run order: %w", err)
	}

	for _, svc := range sorted {
		meta := svc.plugin.Metadata()
		resource := BuildResourceContext(meta.Name, meta.Version, sc.opts.AppID, sc.opts.Mode, sc.opts.Region)
		svcObs := sc.backend.CreateObservable(NewDTrace(), svc.name, resource)

		obs.Log().Debug("running service", map[string]any{"plugin": svc.name})
		if err := svc.plugin.Run(ctx, svcObs); err != nil {
			return fmt.Errorf("service %q run failed: %w", svc.name, err)
		}
	}

	obs.Log().Info("all service plugins running", map[string]any{
		"count": len(sorted),
	})
	return nil
}

// Dispose cleans up all service plugins in reverse order.
func (sc *ServicesController) Dispose() error {
	var errs []error
	for i := len(sc.services) - 1; i >= 0; i-- {
		if err := sc.services[i].plugin.Dispose(); err != nil {
			errs = append(errs, fmt.Errorf("service %q dispose: %w", sc.services[i].name, err))
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("services dispose errors: %v", errs)
	}
	return nil
}

// topologicalSort orders services based on their before/after dependency declarations.
// If forInit is true, uses initBefore/initAfter; otherwise uses runBefore/runAfter.
func topologicalSort(services []*sortedService, forInit bool) ([]*sortedService, error) {
	if len(services) == 0 {
		return services, nil
	}

	// Build name -> index map
	nameIndex := make(map[string]int, len(services))
	for i, svc := range services {
		nameIndex[svc.name] = i
	}

	// Build adjacency: edges[a] = {b} means a must come before b
	n := len(services)
	inDegree := make([]int, n)
	adj := make([][]int, n)
	for i := range adj {
		adj[i] = []int{}
	}

	addEdge := func(from, to int) {
		adj[from] = append(adj[from], to)
		inDegree[to]++
	}

	for i, svc := range services {
		var before, after []string
		if forInit {
			before = svc.initBeforePlugins
			after = svc.initAfterPlugins
		} else {
			before = svc.runBeforePlugins
			after = svc.runAfterPlugins
		}

		// "before" means this plugin must init BEFORE those plugins
		for _, dep := range before {
			if j, ok := nameIndex[dep]; ok {
				addEdge(i, j)
			}
		}

		// "after" means this plugin must init AFTER those plugins
		for _, dep := range after {
			if j, ok := nameIndex[dep]; ok {
				addEdge(j, i)
			}
		}
	}

	// Kahn's algorithm
	queue := make([]int, 0)
	for i, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, i)
		}
	}

	// Sort queue for deterministic output
	sort.Ints(queue)

	var result []*sortedService
	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]
		result = append(result, services[curr])

		for _, next := range adj[curr] {
			inDegree[next]--
			if inDegree[next] == 0 {
				queue = append(queue, next)
				sort.Ints(queue)
			}
		}
	}

	if len(result) != n {
		// Cycle detected -- find the involved plugins
		var cycled []string
		for i, deg := range inDegree {
			if deg > 0 {
				cycled = append(cycled, services[i].name)
			}
		}
		return nil, &DependencyCycleError{Plugins: cycled}
	}

	return result, nil
}
