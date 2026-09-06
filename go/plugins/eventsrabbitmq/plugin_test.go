package eventsrabbitmq

import (
	"context"
	"encoding/json"
	"github.com/bettercorp/service-base/go/bsb"
	"testing"
	"time"
)

func TestWireTraceQueuesAndBinaryChunks(t *testing.T) {
	transport, err := New(map[string]any{"platformKey": "test"})
	if err != nil {
		t.Fatal(err)
	}
	p := transport.(*Plugin)
	queue, err := p.queue("91ar", "service", "event")
	if err != nil || queue != "91ar-test-service-event" {
		t.Fatalf("queue=%s err=%v", queue, err)
	}
	p.ctx = context.Background()
	p.obs = bsb.NewObservable(bsb.NewDTrace(), bsb.ResourceContext{}, bsb.NewObservableBackend(bsb.ModeProduction, "test", "rabbit"), "rabbit")
	trace := bsb.NewDTrace()
	data, _ := json.Marshal(map[string]any{"trace": trace, "args": []any{map[string]any{"value": 1}}})
	var wire map[string]any
	json.Unmarshal(data, &wire)
	decoded, err := wireTrace(wire["trace"])
	if err != nil || decoded != trace {
		t.Fatalf("wire trace/span identifiers changed: %v %v", decoded, err)
	}
	if _, err := wireTrace(map[string]any{"t": trace.TraceID, "s": "xxxxxxxxxxxxxxxx"}); err == nil {
		t.Fatal("invalid span accepted")
	}
	_, span, payload, err := p.incoming(wire, "service", "echo")
	if err != nil || span.TraceID() != trace.TraceID || payload.(map[string]any)["value"] != float64(1) {
		t.Fatalf("wire trace/payload: %v", err)
	}
	span.End()
	for _, invalid := range []any{[]any{float64(-1)}, []any{float64(256)}, []any{1.5}, map[string]any{"type": "other", "data": []any{}}} {
		if _, err := decodeChunk(invalid); err == nil {
			t.Fatalf("accepted invalid bytes: %v", invalid)
		}
	}
	bytes, err := decodeChunk(map[string]any{"type": "Buffer", "data": []any{float64(0), float64(255)}})
	if err != nil || len(bytes) != 2 || bytes[1] != 255 {
		t.Fatalf("chunk: %v %v", bytes, err)
	}
	if _, err := p.ReceiveStream(p.ctx, p.obs, "service", "file", nil, time.Millisecond); err == nil {
		t.Fatal("accepted fractional stream timeout")
	}
}
