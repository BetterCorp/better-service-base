package bsb

import (
	"context"
	"fmt"
	"io"
	"time"
)

type eventRoute struct {
	plugin EventsPlugin
	filter any
}
type eventRouter struct{ routes []eventRoute }

func validateEventFilter(filter any) error {
	switch value := filter.(type) {
	case nil:
		return nil
	case []any:
		for _, item := range value {
			if _, ok := item.(string); !ok {
				return fmt.Errorf("event filter lists must contain strings")
			}
		}
	case map[string]any:
		for _, item := range value {
			switch v := item.(type) {
			case bool:
			case []any:
				if err := validateEventFilter(v); err != nil {
					return err
				}
			case map[string]any:
				if _, ok := v["enabled"].(bool); !ok {
					return fmt.Errorf("event filter enabled must be boolean")
				}
				list, ok := v["plugins"].([]any)
				if !ok {
					return fmt.Errorf("event filter plugins must be a list")
				}
				if err := validateEventFilter(list); err != nil {
					return err
				}
			default:
				return fmt.Errorf("invalid event filter operation")
			}
		}
	default:
		return fmt.Errorf("event filter must be a list or object")
	}
	return nil
}
func eventFilterMatches(filter any, operation, plugin string) bool {
	if filter == nil {
		return true
	}
	var list []any
	switch value := filter.(type) {
	case []any:
		for _, item := range value {
			if item == operation {
				return true
			}
		}
		return false
	case map[string]any:
		switch entry := value[operation].(type) {
		case bool:
			return entry
		case []any:
			list = entry
		case map[string]any:
			if entry["enabled"] != true {
				return false
			}
			list, _ = entry["plugins"].([]any)
		}
	}
	for _, item := range list {
		if item == plugin {
			return true
		}
	}
	return false
}
func (r *eventRouter) route(operation, plugin string) (EventsPlugin, error) {
	for _, entry := range r.routes {
		if eventFilterMatches(entry.filter, operation, plugin) {
			return entry.plugin, nil
		}
	}
	return nil, fmt.Errorf("no events backend matches %s for %s", operation, plugin)
}

// The controller owns backend lifecycle; services only use this routing facade.
func (r *eventRouter) Init(context.Context, Observable) error { return nil }
func (r *eventRouter) Run(context.Context, Observable) error  { return nil }
func (r *eventRouter) Dispose() error                         { return nil }
func (r *eventRouter) OnEvent(ctx context.Context, obs Observable, p, e string, h EventListener) error {
	b, err := r.route("onEvent", p)
	if err != nil {
		return err
	}
	return b.OnEvent(ctx, obs, p, e, h)
}
func (r *eventRouter) EmitEvent(ctx context.Context, obs Observable, p, e string, v any) error {
	b, err := r.route("emitEvent", p)
	if err != nil {
		return err
	}
	return b.EmitEvent(ctx, obs, p, e, v)
}
func (r *eventRouter) OnBroadcast(ctx context.Context, obs Observable, p, e string, h BroadcastListener) error {
	b, err := r.route("onBroadcast", p)
	if err != nil {
		return err
	}
	return b.OnBroadcast(ctx, obs, p, e, h)
}
func (r *eventRouter) EmitBroadcast(ctx context.Context, obs Observable, p, e string, v any) error {
	b, err := r.route("emitBroadcast", p)
	if err != nil {
		return err
	}
	return b.EmitBroadcast(ctx, obs, p, e, v)
}
func (r *eventRouter) OnReturnableEvent(ctx context.Context, obs Observable, p, e string, h ReturnableListener) error {
	b, err := r.route("onReturnableEvent", p)
	if err != nil {
		return err
	}
	return b.OnReturnableEvent(ctx, obs, p, e, h)
}
func (r *eventRouter) EmitEventAndReturn(ctx context.Context, obs Observable, p, e string, t time.Duration, v any) (any, error) {
	b, err := r.route("emitEventAndReturn", p)
	if err != nil {
		return nil, err
	}
	return b.EmitEventAndReturn(ctx, obs, p, e, t, v)
}
func (r *eventRouter) ReceiveStream(ctx context.Context, obs Observable, p, e string, h StreamListener, t time.Duration) (string, error) {
	b, err := r.route("receiveStream", p)
	if err != nil {
		return "", err
	}
	return b.ReceiveStream(ctx, obs, p, e, h, t)
}
func (r *eventRouter) SendStream(ctx context.Context, obs Observable, p, e, id string, v io.Reader) error {
	b, err := r.route("sendStream", p)
	if err != nil {
		return err
	}
	return b.SendStream(ctx, obs, p, e, id, v)
}
