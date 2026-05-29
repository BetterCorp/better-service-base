// Package servicedefault0 provides a sample service plugin matching Node.js service-default0.
// It demonstrates config consumption, fire-and-forget events, and returnable events.
package servicedefault0

import (
	"context"
	"fmt"

	av "github.com/BetterCorp/AnyVali/sdk/go"
	"github.com/bettercorp/service-base/go/bsb"
)

// Config holds the plugin configuration.
type Config struct {
	TestA int
	TestB int
}

// CalculateRequest is the payload for the "calculate" returnable event.
type CalculateRequest struct {
	A int `json:"a"`
	B int `json:"b"`
}

// Plugin implements bsb.ServicePlugin for service-default0.
type Plugin struct {
	config  Config
	events  *bsb.PluginEvents
	backend *bsb.ObservableBackend
}

// New creates a new service-default0 plugin from a config map.
func New(config map[string]any) (bsb.ServicePlugin, error) {
	p := &Plugin{}
	if v, ok := config["testa"]; ok {
		switch n := v.(type) {
		case float64:
			p.config.TestA = int(n)
		case int:
			p.config.TestA = n
		}
	}
	if v, ok := config["testb"]; ok {
		switch n := v.(type) {
		case float64:
			p.config.TestB = int(n)
		case int:
			p.config.TestB = n
		}
	}
	return p, nil
}

// Metadata returns the plugin metadata for registry and dependency ordering.
func (p *Plugin) Metadata() bsb.PluginMetadata {
	return bsb.PluginMetadata{
		Name:        "service-default0",
		Description: "Sample service plugin demonstrating events and config",
		Version:     "1.0.0",
		Category:    bsb.PluginTypeService,
		Tags:        []string{"sample", "demo"},
	}
}

// SetEvents provides the plugin with its event facade.
func (p *Plugin) SetEvents(events *bsb.PluginEvents) {
	p.events = events
}

// SetObservableBackend provides the plugin with the observable backend.
func (p *Plugin) SetObservableBackend(backend *bsb.ObservableBackend) {
	p.backend = backend
}

// EventSchemas returns the event schemas defined by this plugin.
// EmitEvents: "test" -- fire-and-forget with string payload.
// OnReturnableEvents: "calculate" -- takes {a, b int}, returns their sum.
func EventSchemas() bsb.BSBEventSchemas {
	schemas := bsb.NewEventSchemas()
	schemas.EmitEvents["test"] = bsb.CreateFireAndForgetEvent(
		bsb.StringSchema(),
		"Fire-and-forget test event",
	)
	schemas.OnReturnableEvents["calculate"] = bsb.CreateReturnableEvent(
		bsb.ObjectSchema(map[string]av.Schema{
			"a": bsb.Int32Schema(),
			"b": bsb.Int32Schema(),
		}),
		bsb.Int32Schema(),
		"Returns the sum of two integers",
	)
	return schemas
}

// Init registers event handlers. The "calculate" handler returns a + b.
func (p *Plugin) Init(ctx context.Context, obs bsb.Observable) error {
	obs.Log().Info("service-default0: initializing", map[string]any{
		"testa": p.config.TestA,
		"testb": p.config.TestB,
	})

	// Register the "calculate" returnable event handler
	err := p.events.OnReturnableEvent(ctx, "calculate", func(ctx context.Context, obs bsb.Observable, payload any) (any, error) {
		req, ok := payload.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("calculate: invalid payload type %T", payload)
		}

		a, b := 0, 0
		if v, ok := req["a"]; ok {
			switch n := v.(type) {
			case float64:
				a = int(n)
			case int:
				a = n
			}
		}
		if v, ok := req["b"]; ok {
			switch n := v.(type) {
			case float64:
				b = int(n)
			case int:
				b = n
			}
		}

		sum := a + b
		obs.Log().Debug("service-default0: calculate", map[string]any{
			"a":      a,
			"b":      b,
			"result": sum,
		})
		return sum, nil
	})
	if err != nil {
		return fmt.Errorf("service-default0: failed to register calculate handler: %w", err)
	}

	obs.Log().Info("service-default0: initialized")
	return nil
}

// Run emits a "test" event and calls "calculate" with the configured values.
func (p *Plugin) Run(ctx context.Context, obs bsb.Observable) error {
	obs.Log().Info("service-default0: running")

	// Emit a fire-and-forget "test" event
	if err := p.events.EmitEvent(ctx, "test", "hello from service-default0"); err != nil {
		obs.Log().Warn("service-default0: test event emit failed", map[string]any{
			"error": err.Error(),
		})
	}

	// Call the "calculate" returnable event with config values
	result, err := p.events.EmitEventAndReturn(ctx, "calculate", map[string]any{
		"a": p.config.TestA,
		"b": p.config.TestB,
	})
	if err != nil {
		obs.Log().Warn("service-default0: calculate call failed", map[string]any{
			"error": err.Error(),
		})
	} else {
		obs.Log().Info("service-default0: calculate result", map[string]any{
			"a":      p.config.TestA,
			"b":      p.config.TestB,
			"result": result,
		})
	}

	return nil
}

// Dispose cleans up the plugin.
func (p *Plugin) Dispose() error {
	return nil
}

// Register registers the service-default0 plugin with the given registry.
func Register(registry *bsb.PluginRegistry) {
	registry.RegisterService("service-default0", func(config map[string]any) (bsb.ServicePlugin, error) {
		return New(config)
	})
}
