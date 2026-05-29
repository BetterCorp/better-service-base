package bsb

import (
	"context"
	"io"
	"time"
)

// PluginEvents provides a service plugin with a scoped facade to the event bus.
// All calls are automatically scoped to the owning plugin's name.
type PluginEvents struct {
	pluginName string
	bus        EventsPlugin
	backend    *ObservableBackend
	resource   ResourceContext
	schemas    BSBEventSchemas
	validator  *EventValidator
}

// NewPluginEvents creates a new event facade for a service plugin.
func NewPluginEvents(pluginName string, bus EventsPlugin, backend *ObservableBackend, resource ResourceContext, schemas BSBEventSchemas) *PluginEvents {
	return &PluginEvents{
		pluginName: pluginName,
		bus:        bus,
		backend:    backend,
		resource:   resource,
		schemas:    schemas,
		validator:  NewEventValidator(DefaultEventValidationConfig(), backend),
	}
}

// NewPluginEventsWithValidator creates a new event facade with a custom EventValidator.
func NewPluginEventsWithValidator(pluginName string, bus EventsPlugin, backend *ObservableBackend, resource ResourceContext, schemas BSBEventSchemas, validator *EventValidator) *PluginEvents {
	return &PluginEvents{
		pluginName: pluginName,
		bus:        bus,
		backend:    backend,
		resource:   resource,
		schemas:    schemas,
		validator:  validator,
	}
}

// OnEvent registers a listener for a fire-and-forget event.
func (pe *PluginEvents) OnEvent(ctx context.Context, eventName string, listener EventListener) error {
	obs := pe.createObs()

	// Wrap the listener with input validation if a schema exists.
	if schema, ok := pe.schemas.OnEvents[eventName]; ok && schema.Input != nil {
		originalListener := listener
		listener = func(ctx context.Context, obs Observable, payload any) error {
			vr := pe.validator.ValidateInput(eventName, payload, schema.Input, obs.Trace())
			if !vr.Success {
				return vr.Error
			}
			return originalListener(ctx, obs, vr.Data)
		}
	}

	return pe.bus.OnEvent(ctx, obs, pe.pluginName, eventName, listener)
}

// EmitEvent fires a fire-and-forget event.
func (pe *PluginEvents) EmitEvent(ctx context.Context, eventName string, payload any) error {
	obs := pe.createObs()

	// Validate outgoing payload if a schema exists.
	if schema, ok := pe.schemas.EmitEvents[eventName]; ok && schema.Input != nil {
		vr := pe.validator.ValidateInput(eventName, payload, schema.Input, obs.Trace())
		if !vr.Success {
			return vr.Error
		}
		payload = vr.Data
	}

	return pe.bus.EmitEvent(ctx, obs, pe.pluginName, eventName, payload)
}

// OnReturnableEvent registers a listener for a returnable event.
func (pe *PluginEvents) OnReturnableEvent(ctx context.Context, eventName string, listener ReturnableListener) error {
	obs := pe.createObs()

	// Wrap the listener with input and output validation if a schema exists.
	if schema, ok := pe.schemas.OnReturnableEvents[eventName]; ok {
		originalListener := listener
		listener = func(ctx context.Context, obs Observable, payload any) (any, error) {
			// Validate input.
			if schema.Input != nil {
				vr := pe.validator.ValidateInput(eventName, payload, schema.Input, obs.Trace())
				if !vr.Success {
					return nil, vr.Error
				}
				payload = vr.Data
			}

			result, err := originalListener(ctx, obs, payload)
			if err != nil {
				return nil, err
			}

			// Validate output.
			if schema.Output != nil {
				vr := pe.validator.ValidateOutput(eventName, result, schema.Output, obs.Trace())
				if !vr.Success {
					return nil, vr.Error
				}
				result = vr.Data
			}

			return result, nil
		}
	}

	return pe.bus.OnReturnableEvent(ctx, obs, pe.pluginName, eventName, listener)
}

// EmitEventAndReturn fires a returnable event and waits for a response.
func (pe *PluginEvents) EmitEventAndReturn(ctx context.Context, eventName string, payload any, timeout ...time.Duration) (any, error) {
	obs := pe.createObs()
	t := 5 * time.Second
	if len(timeout) > 0 {
		t = timeout[0]
	} else if schema, ok := pe.schemas.EmitReturnableEvents[eventName]; ok && schema.DefaultTimeout > 0 {
		t = time.Duration(schema.DefaultTimeout * float64(time.Second))
	}

	// Validate outgoing input payload.
	if schema, ok := pe.schemas.EmitReturnableEvents[eventName]; ok && schema.Input != nil {
		vr := pe.validator.ValidateInput(eventName, payload, schema.Input, obs.Trace())
		if !vr.Success {
			return nil, vr.Error
		}
		payload = vr.Data
	}

	result, err := pe.bus.EmitEventAndReturn(ctx, obs, pe.pluginName, eventName, t, payload)
	if err != nil {
		return nil, err
	}

	// Validate incoming output payload.
	if schema, ok := pe.schemas.EmitReturnableEvents[eventName]; ok && schema.Output != nil {
		vr := pe.validator.ValidateOutput(eventName, result, schema.Output, obs.Trace())
		if !vr.Success {
			return nil, vr.Error
		}
		result = vr.Data
	}

	return result, nil
}

// OnBroadcast registers a listener for a broadcast event.
func (pe *PluginEvents) OnBroadcast(ctx context.Context, eventName string, listener BroadcastListener) error {
	obs := pe.createObs()

	// Wrap the listener with input validation if a schema exists.
	if schema, ok := pe.schemas.OnBroadcast[eventName]; ok && schema.Input != nil {
		originalListener := listener
		listener = func(ctx context.Context, obs Observable, payload any) error {
			vr := pe.validator.ValidateInput(eventName, payload, schema.Input, obs.Trace())
			if !vr.Success {
				return vr.Error
			}
			return originalListener(ctx, obs, vr.Data)
		}
	}

	return pe.bus.OnBroadcast(ctx, obs, pe.pluginName, eventName, listener)
}

// EmitBroadcast fires a broadcast event to all listeners.
func (pe *PluginEvents) EmitBroadcast(ctx context.Context, eventName string, payload any) error {
	obs := pe.createObs()

	// Validate outgoing payload if a schema exists.
	if schema, ok := pe.schemas.EmitBroadcast[eventName]; ok && schema.Input != nil {
		vr := pe.validator.ValidateInput(eventName, payload, schema.Input, obs.Trace())
		if !vr.Success {
			return vr.Error
		}
		payload = vr.Data
	}

	return pe.bus.EmitBroadcast(ctx, obs, pe.pluginName, eventName, payload)
}

// ReceiveStream registers a stream listener and returns a stream ID.
func (pe *PluginEvents) ReceiveStream(ctx context.Context, eventName string, listener StreamListener, timeout ...time.Duration) (string, error) {
	obs := pe.createObs()
	t := 30 * time.Second
	if len(timeout) > 0 {
		t = timeout[0]
	}
	return pe.bus.ReceiveStream(ctx, obs, pe.pluginName, eventName, listener, t)
}

// SendStream sends data through a stream.
func (pe *PluginEvents) SendStream(ctx context.Context, eventName string, streamID string, stream io.Reader) error {
	obs := pe.createObs()
	return pe.bus.SendStream(ctx, obs, pe.pluginName, eventName, streamID, stream)
}

// createObs creates a bootstrap Observable for event operations.
func (pe *PluginEvents) createObs() Observable {
	trace := NewDTrace()
	return NewObservable(trace, pe.resource, pe.backend, pe.pluginName)
}
