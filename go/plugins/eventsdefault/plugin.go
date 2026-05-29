// Package eventsdefault provides the default in-memory event bus plugin.
// It handles broadcast, fire-and-forget, returnable, and stream events
// within a single process using Go channels and callbacks.
package eventsdefault

import (
	"context"
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
	"github.com/google/uuid"
)

// maxDedupeIDs is the maximum number of message IDs retained for deduplication.
const maxDedupeIDs = 50

// Plugin implements bsb.EventsPlugin with in-memory event routing.
type Plugin struct {
	mu                  sync.RWMutex
	eventListeners      map[string][]bsb.EventListener
	broadcastListeners  map[string][]bsb.BroadcastListener
	returnableListeners map[string]bsb.ReturnableListener
	streamListeners     map[string]bsb.StreamListener

	dedupeMu       sync.Mutex
	lastMessageIDs []string
}

// New creates a new events-default plugin.
func New(_ map[string]any) (bsb.EventsPlugin, error) {
	return &Plugin{
		eventListeners:      make(map[string][]bsb.EventListener),
		broadcastListeners:  make(map[string][]bsb.BroadcastListener),
		returnableListeners: make(map[string]bsb.ReturnableListener),
		streamListeners:     make(map[string]bsb.StreamListener),
		lastMessageIDs:      make([]string, 0, maxDedupeIDs),
	}, nil
}

// Init is a no-op for the default events plugin.
func (p *Plugin) Init(_ context.Context, _ bsb.Observable) error { return nil }

// Run is a no-op for the default events plugin.
func (p *Plugin) Run(_ context.Context, _ bsb.Observable) error { return nil }

// Dispose clears all listeners.
func (p *Plugin) Dispose() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.eventListeners = make(map[string][]bsb.EventListener)
	p.broadcastListeners = make(map[string][]bsb.BroadcastListener)
	p.returnableListeners = make(map[string]bsb.ReturnableListener)
	p.streamListeners = make(map[string]bsb.StreamListener)

	p.dedupeMu.Lock()
	p.lastMessageIDs = make([]string, 0, maxDedupeIDs)
	p.dedupeMu.Unlock()

	return nil
}

func eventKey(pluginName, event string) string {
	return pluginName + ":" + event
}

// generateMessageID creates a new UUID-based message identifier.
func generateMessageID() string {
	return uuid.New().String()
}

// isDuplicate checks if a message ID was already seen and records it if not.
// Uses a FIFO buffer capped at maxDedupeIDs entries.
func (p *Plugin) isDuplicate(messageID string) bool {
	p.dedupeMu.Lock()
	defer p.dedupeMu.Unlock()

	for _, id := range p.lastMessageIDs {
		if id == messageID {
			return true
		}
	}

	// Add to buffer, shift oldest if at capacity
	if len(p.lastMessageIDs) >= maxDedupeIDs {
		p.lastMessageIDs = p.lastMessageIDs[1:]
	}
	p.lastMessageIDs = append(p.lastMessageIDs, messageID)
	return false
}

// OnBroadcast registers a broadcast listener.
func (p *Plugin) OnBroadcast(_ context.Context, obs bsb.Observable, pluginName, event string, listener bsb.BroadcastListener) error {
	key := eventKey(pluginName, event)
	p.mu.Lock()
	defer p.mu.Unlock()

	// Wrap the listener to create a receive span
	wrapped := func(ctx context.Context, innerObs bsb.Observable, payload any) error {
		span := innerObs.StartSpan("onBroadcast:receive", map[string]any{
			"pluginName": pluginName,
			"event":      event,
		})
		defer span.End()
		err := listener(ctx, span, payload)
		if err != nil {
			span.Error(err)
		}
		return err
	}

	p.broadcastListeners[key] = append(p.broadcastListeners[key], wrapped)
	return nil
}

// EmitBroadcast sends an event to all broadcast listeners.
func (p *Plugin) EmitBroadcast(ctx context.Context, obs bsb.Observable, pluginName, event string, payload any) error {
	span := obs.StartSpan("emitBroadcast:send", map[string]any{
		"pluginName": pluginName,
		"event":      event,
	})
	defer span.End()

	key := eventKey(pluginName, event)
	p.mu.RLock()
	listeners := make([]bsb.BroadcastListener, len(p.broadcastListeners[key]))
	copy(listeners, p.broadcastListeners[key])
	p.mu.RUnlock()

	var errs []error
	for _, listener := range listeners {
		if err := listener(ctx, span, payload); err != nil {
			errs = append(errs, err)
		}
	}
	if len(errs) > 0 {
		combined := fmt.Errorf("broadcast errors: %v", errs)
		span.Error(combined)
		return combined
	}
	return nil
}

// OnEvent registers a fire-and-forget event listener.
func (p *Plugin) OnEvent(_ context.Context, obs bsb.Observable, pluginName, event string, listener bsb.EventListener) error {
	key := eventKey(pluginName, event)
	p.mu.Lock()
	defer p.mu.Unlock()

	// Wrap the listener to handle deduplication and receive span creation.
	// The envelope (messageID + payload) is unpacked here so the listener
	// receives only the original payload.
	wrapped := func(ctx context.Context, innerObs bsb.Observable, envelopeRaw any) error {
		envelope, ok := envelopeRaw.(eventEnvelope)
		if !ok {
			// Direct call without envelope -- just invoke the listener
			span := innerObs.StartSpan("onEvent:receive", map[string]any{
				"pluginName": pluginName,
				"event":      event,
			})
			defer span.End()
			err := listener(ctx, span, envelopeRaw)
			if err != nil {
				span.Error(err)
			}
			return err
		}

		// Deduplicate by message ID
		if p.isDuplicate(envelope.MessageID) {
			return nil
		}

		span := innerObs.StartSpan("onEvent:receive", map[string]any{
			"pluginName": pluginName,
			"event":      event,
			"messageId":  envelope.MessageID,
		})
		defer span.End()
		err := listener(ctx, span, envelope.Payload)
		if err != nil {
			span.Error(err)
		}
		return err
	}

	p.eventListeners[key] = append(p.eventListeners[key], wrapped)
	return nil
}

// eventEnvelope wraps a fire-and-forget payload with a message ID for deduplication.
type eventEnvelope struct {
	MessageID string
	Payload   any
}

// EmitEvent fires a fire-and-forget event to the first registered listener.
func (p *Plugin) EmitEvent(ctx context.Context, obs bsb.Observable, pluginName, event string, payload any) error {
	messageID := generateMessageID()
	span := obs.StartSpan("emitEvent:send", map[string]any{
		"pluginName": pluginName,
		"event":      event,
		"messageId":  messageID,
	})
	defer span.End()

	key := eventKey(pluginName, event)
	p.mu.RLock()
	listeners := p.eventListeners[key]
	p.mu.RUnlock()

	if len(listeners) == 0 {
		return nil // fire-and-forget: no listeners is acceptable
	}

	envelope := eventEnvelope{
		MessageID: messageID,
		Payload:   payload,
	}

	// Call the first listener (fire-and-forget semantics)
	err := listeners[0](ctx, span, envelope)
	if err != nil {
		span.Error(err)
	}
	return err
}

// OnReturnableEvent registers a returnable event listener.
func (p *Plugin) OnReturnableEvent(_ context.Context, obs bsb.Observable, pluginName, event string, listener bsb.ReturnableListener) error {
	key := eventKey(pluginName, event)
	p.mu.Lock()
	defer p.mu.Unlock()

	// Wrap the listener to create a receive span
	wrapped := func(ctx context.Context, innerObs bsb.Observable, payload any) (any, error) {
		span := innerObs.StartSpan("onReturnableEvent:receive", map[string]any{
			"pluginName": pluginName,
			"event":      event,
		})
		defer span.End()
		result, err := listener(ctx, span, payload)
		if err != nil {
			span.Error(err)
		}
		return result, err
	}

	p.returnableListeners[key] = wrapped
	return nil
}

// EmitEventAndReturn fires a returnable event and waits for a response.
func (p *Plugin) EmitEventAndReturn(ctx context.Context, obs bsb.Observable, pluginName, event string, timeout time.Duration, payload any) (any, error) {
	span := obs.StartSpan("emitEventAndReturn:send", map[string]any{
		"pluginName": pluginName,
		"event":      event,
	})
	defer span.End()

	key := eventKey(pluginName, event)
	p.mu.RLock()
	listener, ok := p.returnableListeners[key]
	p.mu.RUnlock()

	if !ok {
		err := fmt.Errorf("no listener registered for returnable event %q", key)
		span.Error(err)
		return nil, err
	}

	// Execute with timeout
	type result struct {
		value any
		err   error
	}

	ch := make(chan result, 1)
	go func() {
		v, err := listener(ctx, span, payload)
		ch <- result{value: v, err: err}
	}()

	select {
	case r := <-ch:
		if r.err != nil {
			span.Error(r.err)
		}
		return r.value, r.err
	case <-time.After(timeout):
		err := fmt.Errorf("returnable event %q timed out after %v", key, timeout)
		span.Error(err)
		return nil, err
	case <-ctx.Done():
		span.Error(ctx.Err())
		return nil, ctx.Err()
	}
}

// ReceiveStream registers a stream listener and returns a stream ID.
func (p *Plugin) ReceiveStream(_ context.Context, obs bsb.Observable, pluginName, event string, listener bsb.StreamListener, _ time.Duration) (string, error) {
	key := eventKey(pluginName, event)
	streamID := bsb.NewDTrace().SpanID // use a span ID as stream identifier

	p.mu.Lock()
	defer p.mu.Unlock()
	streamKey := key + ":" + streamID

	// Wrap the listener to create a receive span
	wrapped := func(ctx context.Context, innerObs bsb.Observable, stream io.Reader) error {
		span := innerObs.StartSpan("receiveStream:receive", map[string]any{
			"pluginName": pluginName,
			"event":      event,
			"streamId":   streamID,
		})
		defer span.End()
		err := listener(ctx, span, stream)
		if err != nil {
			span.Error(err)
		}
		return err
	}

	p.streamListeners[streamKey] = wrapped

	return streamID, nil
}

// SendStream sends data through a previously registered stream.
func (p *Plugin) SendStream(ctx context.Context, obs bsb.Observable, pluginName, event string, streamID string, stream io.Reader) error {
	span := obs.StartSpan("sendStream:send", map[string]any{
		"pluginName": pluginName,
		"event":      event,
		"streamId":   streamID,
	})
	defer span.End()

	key := eventKey(pluginName, event)
	streamKey := key + ":" + streamID

	p.mu.RLock()
	listener, ok := p.streamListeners[streamKey]
	p.mu.RUnlock()

	if !ok {
		err := fmt.Errorf("no stream listener for %q", streamKey)
		span.Error(err)
		return err
	}

	err := listener(ctx, span, stream)
	if err != nil {
		span.Error(err)
	}
	return err
}

// Register registers the events-default plugin with the given registry.
func Register(registry *bsb.PluginRegistry) {
	registry.RegisterEvents("events-default", func(config map[string]any) (bsb.EventsPlugin, error) {
		return New(config)
	})
}
