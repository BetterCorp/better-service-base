package eventsrabbitmq

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/bettercorp/service-base/go/bsb"
	"io"
	"strings"
	"testing"
	"time"
)

func TestBlockedSourceReadStops(t *testing.T) {
	for _, mode := range []string{"timeout", "caller", "transport"} {
		t.Run(mode, func(t *testing.T) {
			reader, writer := io.Pipe()
			defer reader.Close()
			defer writer.Close()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			transport, stop := context.WithCancel(context.Background())
			defer stop()
			if mode == "caller" {
				time.AfterFunc(20*time.Millisecond, cancel)
			}
			if mode == "transport" {
				time.AfterFunc(20*time.Millisecond, stop)
			}
			done := make(chan error, 1)
			go func() { _, err := readSource(ctx, transport, reader, 30*time.Millisecond); done <- err }()
			select {
			case err := <-done:
				if err == nil {
					t.Fatal("blocked source succeeded")
				}
			case <-time.After(time.Second):
				t.Fatal("blocked read ignored timeout/cancellation")
			}
			if _, err := writer.Write([]byte("late")); !errors.Is(err, io.ErrClosedPipe) {
				t.Fatal("source not closed", err)
			}
		})
	}
}

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
	for _, invalid := range []map[string]any{
		{"t": strings.Repeat("0", 32), "s": trace.SpanID},
		{"t": trace.TraceID, "s": strings.Repeat("0", 16)},
	} {
		if _, err := wireTrace(invalid); err == nil {
			t.Fatalf("zero trace identifier accepted: %v", invalid)
		}
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

func TestRabbitWireIdentifiersValidateCompletedValues(t *testing.T) {
	if _, err := New(map[string]any{"uniqueId": "worker||peer"}); err == nil {
		t.Fatal("stream token delimiter accepted in unique ID")
	}
	transport, err := New(nil)
	if err != nil {
		t.Fatal(err)
	}
	p := transport.(*Plugin)
	uuid := "00000000-0000-0000-0000-000000000000"
	boundary := strings.Repeat("\u00e9", 105) + "a"
	if name, err := p.queue("91eb", boundary, "x", uuid); err != nil || len(name) != 255 {
		t.Fatalf("valid completed queue rejected: bytes=%d err=%v", len(name), err)
	}
	if _, err := p.queue("91eb", boundary+"b", "x", uuid); err == nil {
		t.Fatal("oversized completed broadcast queue accepted")
	}
}
