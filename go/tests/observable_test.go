package tests

import (
	"testing"

	"github.com/bettercorp/service-base/go/bsb"
)

func TestObservableBasicFlow(t *testing.T) {
	backend := bsb.NewObservableBackend(bsb.ModeDevelopment, "test-app", "test-plugin")
	resource := bsb.BuildResourceContext("test-plugin", "1.0.0", "test-app", bsb.ModeDevelopment, "us-east-1")
	trace := bsb.NewDTrace()

	obs := bsb.NewObservable(trace, resource, backend, "test-plugin")

	if obs.TraceID() != trace.TraceID {
		t.Error("TraceID mismatch")
	}
	if obs.SpanID() != trace.SpanID {
		t.Error("SpanID mismatch")
	}
	if obs.Resource().ServiceName != "test-plugin" {
		t.Errorf("expected service name 'test-plugin', got %q", obs.Resource().ServiceName)
	}
}

func TestObservableStartSpan(t *testing.T) {
	backend := bsb.NewObservableBackend(bsb.ModeDevelopment, "test-app", "test")
	resource := bsb.BuildResourceContext("test", "1.0.0", "test-app", bsb.ModeDevelopment, "")
	trace := bsb.NewDTrace()

	parent := bsb.NewObservable(trace, resource, backend, "test")
	child := parent.StartSpan("child-operation")

	if child.TraceID() != parent.TraceID() {
		t.Error("child should inherit parent trace ID")
	}
	if child.SpanID() == parent.SpanID() {
		t.Error("child should have different span ID")
	}
	// Should not panic
	child.End()
}

func TestObservableSetAttribute(t *testing.T) {
	backend := bsb.NewObservableBackend(bsb.ModeDevelopment, "test-app", "test")
	resource := bsb.BuildResourceContext("test", "1.0.0", "test-app", bsb.ModeDevelopment, "")
	trace := bsb.NewDTrace()

	obs := bsb.NewObservable(trace, resource, backend, "test")
	obs2 := obs.SetAttribute("key", "value")

	// Original should not be modified (immutable)
	if len(obs.Attributes()) != 0 {
		t.Error("original observable should not have attributes")
	}
	if obs2.Attributes()["key"] != "value" {
		t.Error("new observable should have the attribute")
	}
}

func TestObservableSetAttributes(t *testing.T) {
	backend := bsb.NewObservableBackend(bsb.ModeDevelopment, "test-app", "test")
	resource := bsb.BuildResourceContext("test", "1.0.0", "test-app", bsb.ModeDevelopment, "")
	trace := bsb.NewDTrace()

	obs := bsb.NewObservable(trace, resource, backend, "test")
	obs2 := obs.SetAttributes(map[string]any{"a": 1, "b": "two"})

	attrs := obs2.Attributes()
	if attrs["a"] != 1 || attrs["b"] != "two" {
		t.Error("attributes not set correctly")
	}
}

func TestObservableLog(t *testing.T) {
	backend := bsb.NewObservableBackend(bsb.ModeDevelopment, "test-app", "test")
	resource := bsb.BuildResourceContext("test", "1.0.0", "test-app", bsb.ModeDevelopment, "")
	trace := bsb.NewDTrace()

	obs := bsb.NewObservable(trace, resource, backend, "test")

	// These should not panic
	obs.Log().Debug("debug message")
	obs.Log().Info("info message", map[string]any{"key": "value"})
	obs.Log().Warn("warn message")
	obs.Log().Error("error message")
}

func TestObservableMetrics(t *testing.T) {
	backend := bsb.NewObservableBackend(bsb.ModeDevelopment, "test-app", "test")
	resource := bsb.BuildResourceContext("test", "1.0.0", "test-app", bsb.ModeDevelopment, "")
	trace := bsb.NewDTrace()

	obs := bsb.NewObservable(trace, resource, backend, "test")

	counter := obs.Metrics().Counter("requests", "Total requests", "count")
	counter.Increment()
	if counter.Value() != 1 {
		t.Errorf("expected counter 1, got %d", counter.Value())
	}

	gauge := obs.Metrics().Gauge("active", "Active connections", "connections")
	gauge.Set(5)
	if gauge.Value() != 5 {
		t.Errorf("expected gauge 5, got %f", gauge.Value())
	}

	timer := obs.Metrics().Timer()
	elapsed := timer.Stop()
	if elapsed < 0 {
		t.Error("timer should be non-negative")
	}
}
