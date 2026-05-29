package bsb

import (
	"context"
	"io"
	"time"
)

// Plugin is the base lifecycle interface for all plugin types.
type Plugin interface {
	// Init is called once during initialization (after config is available).
	Init(ctx context.Context, obs Observable) error

	// Run is called after all plugins are initialized.
	Run(ctx context.Context, obs Observable) error

	// Dispose is called during shutdown for cleanup.
	Dispose() error
}

// ConfigPlugin provides configuration data to the framework and other plugins.
type ConfigPlugin interface {
	Plugin

	// GetServicePlugins returns the set of enabled service plugins.
	GetServicePlugins(ctx context.Context, obs Observable) (map[string]PluginDefinition, error)

	// GetEventsPlugins returns the set of enabled events plugins.
	GetEventsPlugins(ctx context.Context, obs Observable) (map[string]PluginDefinition, error)

	// GetObservablePlugins returns the set of enabled observable plugins.
	GetObservablePlugins(ctx context.Context, obs Observable) (map[string]PluginDefinition, error)

	// GetPluginConfig returns the raw config for a specific plugin.
	GetPluginConfig(ctx context.Context, obs Observable, pluginType PluginType, pluginName string) (map[string]any, error)

	// GetServicePluginDefinition returns the resolved name and enabled status.
	GetServicePluginDefinition(ctx context.Context, obs Observable, pluginName string) (*ServicePluginDefinition, error)
}

// EventsPlugin provides the event bus transport layer.
type EventsPlugin interface {
	Plugin

	// Broadcast events -- all listeners receive.
	OnBroadcast(ctx context.Context, obs Observable, pluginName, event string, listener BroadcastListener) error
	EmitBroadcast(ctx context.Context, obs Observable, pluginName, event string, payload any) error

	// Fire-and-forget events -- single listener, no response.
	OnEvent(ctx context.Context, obs Observable, pluginName, event string, listener EventListener) error
	EmitEvent(ctx context.Context, obs Observable, pluginName, event string, payload any) error

	// Returnable events -- single listener, returns response.
	OnReturnableEvent(ctx context.Context, obs Observable, pluginName, event string, listener ReturnableListener) error
	EmitEventAndReturn(ctx context.Context, obs Observable, pluginName, event string, timeout time.Duration, payload any) (any, error)

	// Stream events -- bidirectional data transfer.
	ReceiveStream(ctx context.Context, obs Observable, pluginName, event string, listener StreamListener, timeout time.Duration) (string, error)
	SendStream(ctx context.Context, obs Observable, pluginName, event string, streamID string, stream io.Reader) error
}

// ObservablePlugin receives logging, metric, and tracing events from the framework.
type ObservablePlugin interface {
	Plugin

	// Logging
	OnDebug(trace DTrace, pluginName, message string, meta map[string]any)
	OnInfo(trace DTrace, pluginName, message string, meta map[string]any)
	OnWarn(trace DTrace, pluginName, message string, meta map[string]any)
	OnError(trace DTrace, pluginName, message string, meta map[string]any)

	// Tracing
	OnSpanStart(parentTrace DTrace, pluginName, spanName, spanID string, attributes map[string]any)
	OnSpanEnd(trace DTrace, pluginName, spanID string, attributes map[string]any)
	OnSpanError(trace DTrace, pluginName, spanID string, err error, attributes map[string]any)
}

// ServicePlugin contains business logic and communicates via events.
type ServicePlugin interface {
	Plugin

	// Metadata returns the plugin's metadata.
	Metadata() PluginMetadata

	// SetEvents provides the plugin with its event facade.
	SetEvents(events *PluginEvents)

	// SetObservableBackend provides the plugin with the observable backend.
	SetObservableBackend(backend *ObservableBackend)
}

// BroadcastListener handles broadcast events.
type BroadcastListener func(ctx context.Context, obs Observable, payload any) error

// EventListener handles fire-and-forget events.
type EventListener func(ctx context.Context, obs Observable, payload any) error

// ReturnableListener handles returnable events and returns a response.
type ReturnableListener func(ctx context.Context, obs Observable, payload any) (any, error)

// StreamListener handles incoming stream data.
type StreamListener func(ctx context.Context, obs Observable, stream io.Reader) error
