package tests

import (
	"context"
	"testing"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
	"github.com/bettercorp/service-base/go/plugins/eventsdefault"
)

func newTestObs() bsb.Observable {
	backend := bsb.NewObservableBackend(bsb.ModeDevelopment, "test", "test")
	resource := bsb.BuildResourceContext("test", "1.0.0", "test", bsb.ModeDevelopment, "")
	return bsb.NewObservable(bsb.NewDTrace(), resource, backend, "test")
}

func TestFireAndForget(t *testing.T) {
	plugin, _ := eventsdefault.New(nil)
	ctx := context.Background()
	obs := newTestObs()

	received := make(chan any, 1)
	err := plugin.OnEvent(ctx, obs, "svc", "test.event", func(_ context.Context, _ bsb.Observable, payload any) error {
		received <- payload
		return nil
	})
	if err != nil {
		t.Fatalf("OnEvent failed: %v", err)
	}

	err = plugin.EmitEvent(ctx, obs, "svc", "test.event", map[string]any{"key": "value"})
	if err != nil {
		t.Fatalf("EmitEvent failed: %v", err)
	}

	select {
	case v := <-received:
		m, ok := v.(map[string]any)
		if !ok || m["key"] != "value" {
			t.Errorf("unexpected payload: %v", v)
		}
	case <-time.After(time.Second):
		t.Error("timed out waiting for event")
	}
}

func TestBroadcast(t *testing.T) {
	plugin, _ := eventsdefault.New(nil)
	ctx := context.Background()
	obs := newTestObs()

	count := 0
	for i := 0; i < 3; i++ {
		_ = plugin.OnBroadcast(ctx, obs, "svc", "stats", func(_ context.Context, _ bsb.Observable, _ any) error {
			count++
			return nil
		})
	}

	err := plugin.EmitBroadcast(ctx, obs, "svc", "stats", nil)
	if err != nil {
		t.Fatalf("EmitBroadcast failed: %v", err)
	}
	if count != 3 {
		t.Errorf("expected all 3 listeners called, got %d", count)
	}
}

func TestReturnableEvent(t *testing.T) {
	plugin, _ := eventsdefault.New(nil)
	ctx := context.Background()
	obs := newTestObs()

	_ = plugin.OnReturnableEvent(ctx, obs, "svc", "add", func(_ context.Context, _ bsb.Observable, payload any) (any, error) {
		m := payload.(map[string]any)
		a := m["a"].(float64)
		b := m["b"].(float64)
		return a + b, nil
	})

	result, err := plugin.EmitEventAndReturn(ctx, obs, "svc", "add", 5*time.Second, map[string]any{"a": 10.0, "b": 20.0})
	if err != nil {
		t.Fatalf("EmitEventAndReturn failed: %v", err)
	}
	if result != 30.0 {
		t.Errorf("expected 30, got %v", result)
	}
}

func TestReturnableEventTimeout(t *testing.T) {
	plugin, _ := eventsdefault.New(nil)
	ctx := context.Background()
	obs := newTestObs()

	_ = plugin.OnReturnableEvent(ctx, obs, "svc", "slow", func(_ context.Context, _ bsb.Observable, _ any) (any, error) {
		time.Sleep(2 * time.Second)
		return nil, nil
	})

	_, err := plugin.EmitEventAndReturn(ctx, obs, "svc", "slow", 100*time.Millisecond, nil)
	if err == nil {
		t.Error("expected timeout error")
	}
}

func TestReturnableEventNoListener(t *testing.T) {
	plugin, _ := eventsdefault.New(nil)
	ctx := context.Background()
	obs := newTestObs()

	_, err := plugin.EmitEventAndReturn(ctx, obs, "svc", "missing", 5*time.Second, nil)
	if err == nil {
		t.Error("expected error for missing listener")
	}
}

func TestFireAndForgetNoListener(t *testing.T) {
	plugin, _ := eventsdefault.New(nil)
	ctx := context.Background()
	obs := newTestObs()

	// Fire-and-forget with no listener should not error
	err := plugin.EmitEvent(ctx, obs, "svc", "missing", nil)
	if err != nil {
		t.Errorf("expected no error for missing fire-and-forget listener, got: %v", err)
	}
}

func TestDispose(t *testing.T) {
	plugin, _ := eventsdefault.New(nil)
	ctx := context.Background()
	obs := newTestObs()

	_ = plugin.OnEvent(ctx, obs, "svc", "test", func(_ context.Context, _ bsb.Observable, _ any) error {
		return nil
	})

	err := plugin.Dispose()
	if err != nil {
		t.Fatalf("Dispose failed: %v", err)
	}

	// After dispose, listeners should be cleared
	err = plugin.EmitEvent(ctx, obs, "svc", "test", nil)
	if err != nil {
		t.Errorf("emit after dispose should not error (no listeners): %v", err)
	}
}
