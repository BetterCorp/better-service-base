package bsb

import (
	"encoding/json"
	"fmt"
	"sort"
)

// ExportContracts returns portable metadata without invoking any plugin factory.
func (r *PluginRegistry) ExportContracts() ([]map[string]any, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	keys := make([]string, 0, len(r.contracts))
	for key := range r.contracts {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([]map[string]any, 0, len(keys))
	for _, key := range keys {
		contract := r.contracts[key]
		meta := contract.Metadata
		data, err := json.Marshal(ExportSchemas(meta.Name, meta.Version, contract.Events))
		if err != nil {
			return nil, err
		}
		var item map[string]any
		if err = json.Unmarshal(data, &item); err != nil {
			return nil, err
		}
		item["pluginId"] = meta.Name
		item["language"] = "go"
		item["category"] = meta.Category
		item["documentation"] = contract.Documentation
		item["description"] = meta.Description
		item["author"] = meta.Author
		item["license"] = meta.License
		item["homepage"] = meta.Homepage
		item["repository"] = meta.Repository
		item["tags"] = meta.Tags
		if contract.Capabilities != nil {
			item["capabilities"] = contract.Capabilities
		}
		if contract.Config != nil {
			schema, err := ExportSchema(contract.Config, ExportExtended)
			if err != nil {
				return nil, err
			}
			item["configSchema"] = schema
		}
		result = append(result, item)
	}
	return result, nil
}

// PluginContract is registered alongside a factory; exporting never constructs plugins.
type PluginContract struct {
	Metadata      PluginMetadata
	Config        BSBSchema
	Events        BSBEventSchemas
	Documentation []string
	Capabilities  map[string]any
}

func (r *PluginRegistry) RegisterContract(contract PluginContract) {
	if contract.Metadata.Name == "" {
		panic("plugin contract requires a name")
	}
	if err := contract.Events.Validate(); err != nil {
		panic(err)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.contracts == nil {
		r.contracts = make(map[string]PluginContract)
	}
	key := string(contract.Metadata.Category) + ":" + contract.Metadata.Name
	for _, existing := range r.contracts {
		if existing.Metadata.Name == contract.Metadata.Name {
			panic("duplicate plugin contract ID: " + contract.Metadata.Name)
		}
	}
	r.contracts[key] = contract
}

func (r *PluginRegistry) EventSchemas(kind PluginType, name string) BSBEventSchemas {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.contracts[string(kind)+":"+name].Events
}

func createPlugin[T Plugin](r *PluginRegistry, kind PluginType, name string, config map[string]any, version ...string) (T, error) {
	var zero T
	if err := r.validateVersion(kind, name, requestedVersion(version)); err != nil {
		return zero, err
	}
	factory, err := r.getFactory(kind, name)
	if err != nil {
		return zero, err
	}
	r.mu.RLock()
	contract := r.contracts[string(kind)+":"+name]
	r.mu.RUnlock()
	if config == nil {
		config = map[string]any{}
	}
	if contract.Config != nil {
		parsed, err := contract.Config.Parse(config)
		if err != nil {
			return zero, fmt.Errorf("invalid config for %s: %w", name, err)
		}
		var ok bool
		config, ok = parsed.(map[string]any)
		if !ok {
			return zero, fmt.Errorf("config schema for %s must return an object", name)
		}
	}
	f, ok := factory.(PluginFactory[T])
	if !ok {
		return zero, fmt.Errorf("invalid factory for %s plugin %q", kind, name)
	}
	return f(config)
}

func sortedPluginNames(definitions map[string]PluginDefinition) []string {
	names := make([]string, 0, len(definitions))
	for name := range definitions {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}
