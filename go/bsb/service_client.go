package bsb

import "context"

// ServiceClient provides a typed link from one service plugin to another.
// It exposes the target plugin's events through a scoped PluginEvents facade.
type ServiceClient struct {
	TargetPluginName string
	Events           *PluginEvents

	InitBeforePlugins []string
	InitAfterPlugins  []string
	RunBeforePlugins  []string
	RunAfterPlugins   []string
}

// NewServiceClient creates a new service client targeting another plugin.
// The metadata is extracted from the target plugin's PluginMetadata.
func NewServiceClient(target ServicePlugin, bus EventsPlugin, backend *ObservableBackend, resource ResourceContext) *ServiceClient {
	meta := target.Metadata()
	return &ServiceClient{
		TargetPluginName:  meta.Name,
		Events:            NewPluginEvents(meta.Name, bus, backend, resource, NewEventSchemas()),
		InitBeforePlugins: meta.InitBeforePlugins,
		InitAfterPlugins:  meta.InitAfterPlugins,
		RunBeforePlugins:  meta.RunBeforePlugins,
		RunAfterPlugins:   meta.RunAfterPlugins,
	}
}

// Init is called during the initialization phase.
func (sc *ServiceClient) Init(_ context.Context, _ Observable) error { return nil }

// Run is called after all plugins are initialized.
func (sc *ServiceClient) Run(_ context.Context, _ Observable) error { return nil }

// Dispose is called during shutdown.
func (sc *ServiceClient) Dispose() error { return nil }
