package bsb

import (
	"fmt"
	"sync"
)

// PluginFactory is a constructor function for a plugin.
type PluginFactory[T any] func(config map[string]any) (T, error)

// registeredPlugin holds a plugin factory with its metadata.
type registeredPlugin struct {
	pluginType PluginType
	name       string
	factory    any // PluginFactory[T]
}

// PluginRegistry holds all registered plugin factories.
// Plugins are registered at startup before ServiceBase.Init().
type PluginRegistry struct {
	mu      sync.RWMutex
	plugins map[string]*registeredPlugin // key: "type:name"
}

// NewPluginRegistry creates a new empty plugin registry.
func NewPluginRegistry() *PluginRegistry {
	return &PluginRegistry{
		plugins: make(map[string]*registeredPlugin),
	}
}

// RegisterConfig registers a config plugin factory.
func (r *PluginRegistry) RegisterConfig(name string, factory PluginFactory[ConfigPlugin]) {
	r.register(PluginTypeConfig, name, factory)
}

// RegisterObservable registers an observable plugin factory.
func (r *PluginRegistry) RegisterObservable(name string, factory PluginFactory[ObservablePlugin]) {
	r.register(PluginTypeObservable, name, factory)
}

// RegisterEvents registers an events plugin factory.
func (r *PluginRegistry) RegisterEvents(name string, factory PluginFactory[EventsPlugin]) {
	r.register(PluginTypeEvents, name, factory)
}

// RegisterService registers a service plugin factory.
func (r *PluginRegistry) RegisterService(name string, factory PluginFactory[ServicePlugin]) {
	r.register(PluginTypeService, name, factory)
}

func (r *PluginRegistry) register(pluginType PluginType, name string, factory any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := string(pluginType) + ":" + name
	r.plugins[key] = &registeredPlugin{
		pluginType: pluginType,
		name:       name,
		factory:    factory,
	}
}

// CreateConfig creates a config plugin instance by name.
func (r *PluginRegistry) CreateConfig(name string, config map[string]any) (ConfigPlugin, error) {
	factory, err := r.getFactory(PluginTypeConfig, name)
	if err != nil {
		return nil, err
	}
	f, ok := factory.(PluginFactory[ConfigPlugin])
	if !ok {
		return nil, fmt.Errorf("invalid factory type for config plugin %q", name)
	}
	return f(config)
}

// CreateObservable creates an observable plugin instance by name.
func (r *PluginRegistry) CreateObservable(name string, config map[string]any) (ObservablePlugin, error) {
	factory, err := r.getFactory(PluginTypeObservable, name)
	if err != nil {
		return nil, err
	}
	f, ok := factory.(PluginFactory[ObservablePlugin])
	if !ok {
		return nil, fmt.Errorf("invalid factory type for observable plugin %q", name)
	}
	return f(config)
}

// CreateEvents creates an events plugin instance by name.
func (r *PluginRegistry) CreateEvents(name string, config map[string]any) (EventsPlugin, error) {
	factory, err := r.getFactory(PluginTypeEvents, name)
	if err != nil {
		return nil, err
	}
	f, ok := factory.(PluginFactory[EventsPlugin])
	if !ok {
		return nil, fmt.Errorf("invalid factory type for events plugin %q", name)
	}
	return f(config)
}

// CreateService creates a service plugin instance by name.
func (r *PluginRegistry) CreateService(name string, config map[string]any) (ServicePlugin, error) {
	factory, err := r.getFactory(PluginTypeService, name)
	if err != nil {
		return nil, err
	}
	f, ok := factory.(PluginFactory[ServicePlugin])
	if !ok {
		return nil, fmt.Errorf("invalid factory type for service plugin %q", name)
	}
	return f(config)
}

// HasPlugin checks whether a plugin is registered.
func (r *PluginRegistry) HasPlugin(pluginType PluginType, name string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	key := string(pluginType) + ":" + name
	_, ok := r.plugins[key]
	return ok
}

// ListPlugins returns all registered plugin names for a given type.
func (r *PluginRegistry) ListPlugins(pluginType PluginType) []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var names []string
	prefix := string(pluginType) + ":"
	for key, p := range r.plugins {
		if len(key) > len(prefix) && key[:len(prefix)] == prefix {
			names = append(names, p.name)
		}
	}
	return names
}

func (r *PluginRegistry) getFactory(pluginType PluginType, name string) (any, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	key := string(pluginType) + ":" + name
	p, ok := r.plugins[key]
	if !ok {
		return nil, &PluginNotFoundError{PluginType: pluginType, PluginName: name}
	}
	return p.factory, nil
}
