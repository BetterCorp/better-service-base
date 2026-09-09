package bsb

import (
	"context"
	"testing"
)

type routedTestBus struct {
	EventsPlugin
	received any
}

func (b *routedTestBus) EmitEvent(_ context.Context, _ Observable, _, _ string, value any) error {
	b.received = value
	return nil
}
func TestEventRoutingFiltersAndFallback(t *testing.T) {
	selected, fallback := &routedTestBus{}, &routedTestBus{}
	for _, filter := range []any{
		[]any{"emitEvent"},
		map[string]any{"emitEvent": true},
		map[string]any{"emitEvent": []any{"worker"}},
		map[string]any{"emitEvent": map[string]any{"enabled": true, "plugins": []any{"worker"}}},
	} {
		if err := validateEventFilter(filter); err != nil {
			t.Fatal(err)
		}
		router := &eventRouter{routes: []eventRoute{{selected, filter}, {fallback, nil}}}
		selected.received = nil
		if err := router.EmitEvent(context.Background(), nil, "worker", "echo", "routed"); err != nil || selected.received != "routed" {
			t.Fatal(err, selected.received)
		}
	}
	router := &eventRouter{routes: []eventRoute{{selected, []any{}}, {fallback, nil}}}
	if err := router.EmitEvent(context.Background(), nil, "worker", "echo", "fallback"); err != nil || fallback.received != "fallback" {
		t.Fatal(err, fallback.received)
	}
	for _, invalid := range []any{false, []any{1}, map[string]any{"emitEvent": 42}, map[string]any{"emitEvent": map[string]any{"enabled": true, "plugins": false}}} {
		if validateEventFilter(invalid) == nil {
			t.Fatal("accepted", invalid)
		}
	}
}
