package tests

import (
	"testing"

	"github.com/bettercorp/service-base/go/bsb"
)

func TestNewDTrace(t *testing.T) {
	trace := bsb.NewDTrace()
	if len(trace.TraceID) != 32 {
		t.Errorf("expected TraceID length 32, got %d", len(trace.TraceID))
	}
	if len(trace.SpanID) != 16 {
		t.Errorf("expected SpanID length 16, got %d", len(trace.SpanID))
	}
}

func TestDTraceNewSpan(t *testing.T) {
	parent := bsb.NewDTrace()
	child := parent.NewSpan()

	if child.TraceID != parent.TraceID {
		t.Error("child trace ID should match parent")
	}
	if child.SpanID == parent.SpanID {
		t.Error("child span ID should differ from parent")
	}
}

func TestDTraceString(t *testing.T) {
	trace := bsb.DTrace{TraceID: "abc123", SpanID: "def456"}
	s := trace.String()
	if s != "abc123:def456" {
		t.Errorf("expected 'abc123:def456', got %q", s)
	}
}

func TestTimer(t *testing.T) {
	timer := bsb.NewTimer()
	elapsed := timer.Stop()
	if elapsed < 0 {
		t.Error("timer elapsed should be non-negative")
	}
}

func TestNewTraceIDUniqueness(t *testing.T) {
	ids := make(map[string]bool, 100)
	for i := 0; i < 100; i++ {
		trace := bsb.NewDTrace()
		id := trace.TraceID
		if ids[id] {
			t.Fatalf("duplicate trace ID generated: %s", id)
		}
		ids[id] = true
	}
}

func TestNewSpanIDUniqueness(t *testing.T) {
	ids := make(map[string]bool, 100)
	for i := 0; i < 100; i++ {
		trace := bsb.NewDTrace()
		id := trace.SpanID
		if ids[id] {
			t.Fatalf("duplicate span ID generated: %s", id)
		}
		ids[id] = true
	}
}
