package eventsrabbitmq

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
)

type sender struct {
	peer     string
	controls chan map[string]any
}
type packet struct {
	data []byte
	err  error
	end  bool
}
type receiver struct {
	plugin   *Plugin
	id, peer string // peer is protected by Plugin.mu
	ctx      context.Context
	start    chan map[string]any
	data     chan packet
	timeout  time.Duration
	pending  []byte
	ended    bool // used only by the stream reader
}

func (p *Plugin) control(ctx context.Context, peer, correlation string, body any) error {
	queue, err := p.queue("91se", peer)
	if err != nil {
		return err
	}
	return p.publish(ctx, queue, body, 60000, correlation, 0, false)
}
func (r *receiver) Read(buffer []byte) (int, error) {
	if len(buffer) == 0 {
		return 0, nil
	}
	if len(r.pending) == 0 {
		if r.ended {
			return 0, io.EOF
		}
		if len(r.data) == 0 {
			r.plugin.mu.Lock()
			peer := r.peer
			r.plugin.mu.Unlock()
			if err := r.plugin.control(r.ctx, peer, "s-"+r.id, map[string]any{"type": "read"}); err != nil {
				return 0, err
			}
		}
		select {
		case part := <-r.data:
			if part.err != nil {
				return 0, part.err
			}
			if part.end {
				r.ended = true
				return 0, io.EOF
			}
			r.pending = part.data
		case <-r.ctx.Done():
			return 0, r.ctx.Err()
		case <-time.After(r.timeout):
			return 0, fmt.Errorf("stream read timeout")
		}
	}
	n := copy(buffer, r.pending)
	r.pending = r.pending[n:]
	return n, nil
}
func (p *Plugin) streamControl(message amqp.Delivery, body map[string]any) error {
	correlation := message.CorrelationId
	p.mu.Lock()
	defer p.mu.Unlock()
	if strings.HasPrefix(correlation, "s-") {
		target := p.senders[strings.TrimPrefix(correlation, "s-")]
		if target == nil {
			return nil
		}
		if target.peer != message.AppId {
			return fmt.Errorf("unexpected stream control sender")
		}
		select {
		case target.controls <- body:
			return nil
		default:
			return fmt.Errorf("stream control buffer full")
		}
	}
	if strings.HasPrefix(correlation, "r-") {
		target := p.receivers[strings.TrimPrefix(correlation, "r-")]
		if target == nil {
			return nil
		}
		if body["type"] == "start" {
			if message.AppId == "" || body["myId"] != message.AppId || (target.peer != "" && target.peer != message.AppId) {
				return fmt.Errorf("invalid stream sender")
			}
			target.peer = message.AppId
			select {
			case target.start <- body:
			default:
			}
			return nil
		}
		if body["type"] == "timeout" && target.peer == message.AppId {
			select {
			case target.data <- packet{err: fmt.Errorf("remote stream timed out")}:
			default:
			}
			return nil
		}
	}
	return fmt.Errorf("invalid stream control")
}
func decodeChunk(value any) ([]byte, error) {
	if object, ok := value.(map[string]any); ok {
		if object["type"] != "Buffer" {
			return nil, fmt.Errorf("invalid stream buffer")
		}
		value = object["data"]
	}
	if text, ok := value.(string); ok {
		if len(text) > 1048576 {
			return nil, fmt.Errorf("stream chunk exceeds 1 MiB")
		}
		return []byte(text), nil
	}
	values, ok := value.([]any)
	if !ok || len(values) > 1048576 {
		return nil, fmt.Errorf("invalid stream bytes or chunk size")
	}
	data := make([]byte, len(values))
	for index, value := range values {
		number, ok := value.(float64)
		if raw, valid := value.(json.Number); valid {
			var err error
			number, err = raw.Float64()
			ok = err == nil
		}
		if !ok || number < 0 || number > 255 || number != float64(byte(number)) {
			return nil, fmt.Errorf("invalid stream byte")
		}
		data[index] = byte(number)
	}
	return data, nil
}
func (p *Plugin) streamData(message amqp.Delivery, body map[string]any) error {
	p.mu.Lock()
	target := p.receivers[message.CorrelationId]
	peer := ""
	if target != nil {
		peer = target.peer
	}
	p.mu.Unlock()
	if target == nil {
		return nil
	}
	if peer == "" || peer != message.AppId {
		return fmt.Errorf("unexpected stream sender")
	}
	var part packet
	switch body["type"] {
	case "data":
		data, err := decodeChunk(body["data"])
		if err != nil {
			return err
		}
		part.data = data
	case "event":
		switch body["event"] {
		case "end":
			part.end = true
		case "error":
			part.err = fmt.Errorf("remote stream failed")
		default:
			return fmt.Errorf("invalid stream event")
		}
	default:
		return fmt.Errorf("invalid stream data")
	}
	select {
	case target.data <- part:
	case <-target.ctx.Done():
		return target.ctx.Err()
	case <-time.After(target.timeout):
		return fmt.Errorf("stream receiver stalled")
	}
	return p.control(target.ctx, peer, "s-"+target.id, map[string]any{"type": "receipt", "timeout": target.timeout.Milliseconds()})
}
func (p *Plugin) ReceiveStream(ctx context.Context, obs bsb.Observable, plugin, event string, listener bsb.StreamListener, timeout time.Duration) (string, error) {
	if timeout <= 0 || timeout > 24*time.Hour || timeout%time.Second != 0 {
		return "", fmt.Errorf("stream timeout must be whole seconds in 1..86400")
	}
	id := uuid.NewString()
	streamCtx, cancel := context.WithCancel(p.ctx)
	target := &receiver{plugin: p, id: id, ctx: streamCtx, start: make(chan map[string]any, 1), data: make(chan packet, 8), timeout: timeout}
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		cancel()
		return "", fmt.Errorf("Rabbit transport closed")
	}
	p.receivers[id] = target
	p.workers.Add(1)
	p.mu.Unlock()
	go func() {
		defer p.workers.Done()
		defer cancel()
		defer func() { p.mu.Lock(); delete(p.receivers, id); p.mu.Unlock() }()
		var start map[string]any
		var err error
		select {
		case start = <-target.start:
		case <-ctx.Done():
			err = ctx.Err()
		case <-p.ctx.Done():
			err = p.ctx.Err()
		case <-time.After(30 * time.Second):
			err = fmt.Errorf("stream sender did not start")
		}
		p.mu.Lock()
		peer := target.peer
		p.mu.Unlock()
		span := obs
		if err == nil {
			var wire bsb.DTrace
			wire, err = wireTrace(start["trace"])
			if err == nil {
				span = p.obs.WithTrace(wire, plugin)
			}
		}
		if err == nil {
			span = span.StartSpan("stream.receive")
			defer span.End()
			err = p.control(streamCtx, peer, "s-"+id, map[string]any{"type": "receipt", "timeout": timeout.Milliseconds(), "trace": span.Trace()})
		}
		if err != nil {
			target.data <- packet{err: err}
		}
		handlerErr := listener(bsb.WithObservable(streamCtx, span), span, target)
		if err == nil {
			err = handlerErr
		}
		if err == nil && !target.ended {
			err = fmt.Errorf("receiver must consume stream through EOF")
		}
		if peer != "" && p.ctx.Err() == nil {
			body := map[string]any{"type": "event", "event": "end", "trace": span.Trace()}
			if err != nil {
				body = map[string]any{"type": "timeout"}
			}
			if notifyErr := p.control(streamCtx, peer, "s-"+id, body); err == nil {
				err = notifyErr
			}
		}
		if err != nil {
			span.Error(err)
		}
	}()
	return p.id + "||" + id + "||" + strconv.FormatInt(int64(timeout/time.Second), 10), nil
}

// readSource owns its buffer, so a late Read cannot race with the sender after cancellation.
func readSource(ctx, transport context.Context, source io.Reader, timeout time.Duration) ([]byte, error) {
	result := make(chan packet, 1)
	go func() {
		buffer := make([]byte, 65536)
		n, err := source.Read(buffer)
		result <- packet{data: buffer[:n], err: err}
	}()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	var err error
	select {
	case part := <-result:
		return part.data, part.err
	case <-ctx.Done():
		err = ctx.Err()
	case <-transport.Done():
		err = transport.Err()
	case <-timer.C:
		err = fmt.Errorf("stream source read timeout")
	}
	// Plain io.Reader cannot interrupt Read; use an io.ReadCloser for blocking sources.
	if closer, ok := source.(io.Closer); ok {
		_ = closer.Close()
	}
	return nil, err
}
func (p *Plugin) SendStream(ctx context.Context, obs bsb.Observable, plugin, event, id string, source io.Reader) error {
	parts := strings.Split(id, "||")
	if len(parts) != 3 || parts[0] == "" || parts[1] == "" {
		return fmt.Errorf("invalid stream ID")
	}
	seconds, err := strconv.Atoi(parts[2])
	if err != nil || seconds < 1 || seconds > 86400 {
		return fmt.Errorf("invalid stream timeout")
	}
	timeout := time.Duration(seconds) * time.Second
	peer, id := parts[0], parts[1]
	queue, err := p.queue("91sd", peer)
	if err != nil {
		return err
	}
	target := &sender{peer: peer, controls: make(chan map[string]any, 128)}
	p.mu.Lock()
	if p.closed || p.senders[id] != nil {
		p.mu.Unlock()
		return fmt.Errorf("stream already active or transport closed")
	}
	p.senders[id] = target
	p.mu.Unlock()
	complete := false
	defer func() {
		p.mu.Lock()
		delete(p.senders, id)
		p.mu.Unlock()
		if !complete && p.ctx.Err() == nil {
			_ = p.control(p.ctx, peer, "r-"+id, map[string]any{"type": "timeout"})
		}
	}()
	if err = p.control(ctx, peer, "r-"+id, map[string]any{"type": "start", "myId": p.id, "trace": obs.Trace()}); err != nil {
		return err
	}
	ended := false
	wait := 30 * time.Second
	for {
		var control map[string]any
		select {
		case control = <-target.controls:
		case <-ctx.Done():
			return ctx.Err()
		case <-p.ctx.Done():
			return p.ctx.Err()
		case <-time.After(wait):
			return fmt.Errorf("stream control timeout")
		}
		wait = timeout
		if control["type"] == "receipt" {
			continue
		}
		if control["type"] == "event" && control["event"] == "end" && ended {
			complete = true
			return nil
		}
		if control["type"] != "read" {
			return fmt.Errorf("stream receiver failed or ended early")
		}
		if ended {
			continue
		}
		buffer, readErr := readSource(ctx, p.ctx, source, timeout)
		n := len(buffer)
		if readErr != nil && readErr != io.EOF {
			return readErr
		}
		if n == 0 && readErr == nil {
			continue
		}
		body := map[string]any{"type": "event", "event": "end", "data": nil, "trace": obs.Trace()}
		if n > 0 {
			values := make([]int, n)
			for index, value := range buffer[:n] {
				values[index] = int(value)
			}
			body = map[string]any{"type": "data", "data": map[string]any{"type": "Buffer", "data": values}, "trace": obs.Trace()}
		} else {
			ended = true
		}
		if err = p.publish(ctx, queue, body, 60000, id, 0, false); err != nil {
			return err
		}
	}
}
