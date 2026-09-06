// Package eventsrabbitmq implements the BSB 9 AMQP wire protocol.
package eventsrabbitmq

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
)

type settings struct {
	PlatformKey       *string  `json:"platformKey"`
	FatalOnDisconnect bool     `json:"fatalOnDisconnect"`
	Prefetch          int      `json:"prefetch"`
	Endpoints         []string `json:"endpoints"`
	Credentials       struct {
		Username string `json:"username"`
		Password string `json:"password"`
	} `json:"credentials"`
	UniqueID string `json:"uniqueId"`
}
type rpcResult struct {
	value any
	err   error
}
type handler func(amqp.Delivery, map[string]any) error
type Plugin struct {
	config                   settings
	id                       string
	obs                      bsb.Observable
	ctx                      context.Context
	cancel                   context.CancelFunc
	mu                       sync.Mutex
	closed                   bool
	pending                  map[string]chan rpcResult
	senders                  map[string]*sender
	receivers                map[string]*receiver
	connMu                   sync.Mutex
	publishConn, receiveConn *amqp.Connection
	publishMu                sync.Mutex
	publisher                *amqp.Channel
	returns                  chan amqp.Return
	workers                  sync.WaitGroup
	failure                  chan error
}

func New(config map[string]any) (bsb.EventsPlugin, error) {
	hostname, _ := os.Hostname()
	opts := settings{Prefetch: 10, FatalOnDisconnect: true, Endpoints: []string{"amqp://localhost"}, UniqueID: hostname}
	opts.Credentials.Username = "guest"
	opts.Credentials.Password = "guest"
	data, err := json.Marshal(config)
	if err != nil {
		return nil, err
	}
	if string(data) != "null" {
		if err = json.Unmarshal(data, &opts); err != nil {
			return nil, err
		}
	}
	if len(opts.Endpoints) == 0 || opts.Prefetch < 1 || opts.Prefetch > 65535 {
		return nil, fmt.Errorf("invalid Rabbit endpoints or prefetch")
	}
	vhost := ""
	for index, endpoint := range opts.Endpoints {
		u, err := url.Parse(endpoint)
		if err != nil || u.Hostname() == "" || (u.Scheme != "amqp" && u.Scheme != "amqps") {
			return nil, fmt.Errorf("invalid Rabbit endpoint")
		}
		if index == 0 {
			vhost = u.EscapedPath()
		} else if u.EscapedPath() != vhost {
			return nil, fmt.Errorf("Rabbit endpoints must use the same virtual host")
		}
		u.User = url.UserPassword(opts.Credentials.Username, opts.Credentials.Password)
		opts.Endpoints[index] = u.String()
	}
	p := &Plugin{config: opts, id: opts.UniqueID + "-" + uuid.NewString(), pending: map[string]chan rpcResult{}, senders: map[string]*sender{}, receivers: map[string]*receiver{}, failure: make(chan error, 1)}
	if _, err = p.queue("91kr", p.id); err != nil {
		return nil, err
	}
	return p, nil
}
func Register(registry *bsb.PluginRegistry) { registry.RegisterEvents("events-rabbitmq", New) }
func (p *Plugin) platform(name string) string {
	if p.config.PlatformKey != nil {
		return name + "-" + *p.config.PlatformKey
	}
	return name
}
func (p *Plugin) queue(kind string, parts ...string) (string, error) {
	name := strings.Join(append([]string{p.platform(kind)}, parts...), "-")
	if len(name) > 255 || strings.ContainsRune(name, 0) {
		return "", fmt.Errorf("invalid Rabbit queue name")
	}
	return name, nil
}
func (p *Plugin) Failure() <-chan error { return p.failure }
func (p *Plugin) fail(err error) {
	select {
	case p.failure <- err:
	default:
	}
	p.cancel()
}

func (p *Plugin) connection(publish bool) (*amqp.Connection, error) {
	p.connMu.Lock()
	defer p.connMu.Unlock()
	if p.ctx.Err() != nil {
		return nil, p.ctx.Err()
	}
	existing := p.receiveConn
	if publish {
		existing = p.publishConn
	}
	if existing != nil && !existing.IsClosed() {
		return existing, nil
	}
	var connection *amqp.Connection
	var err error
	for _, endpoint := range p.config.Endpoints {
		connection, err = amqp.DialConfig(endpoint, amqp.Config{Heartbeat: 30 * time.Second, Dial: func(network, address string) (net.Conn, error) {
			return (&net.Dialer{Timeout: 10 * time.Second}).DialContext(p.ctx, network, address)
		}})
		if err == nil {
			break
		}
	}
	if err != nil {
		return nil, fmt.Errorf("Rabbit connection failed")
	}
	if publish {
		p.publishConn = connection
	} else {
		p.receiveConn = connection
	}
	closed := connection.NotifyClose(make(chan *amqp.Error, 1))
	go func() {
		select {
		case err := <-closed:
			if err != nil && p.ctx.Err() == nil && p.config.FatalOnDisconnect {
				p.fail(fmt.Errorf("Rabbit connection closed: %d", err.Code))
			}
		case <-p.ctx.Done():
		}
	}()
	return connection, nil
}
func (p *Plugin) topology(channel *amqp.Channel) error {
	deadletter := p.platform("better.service9.deadletter")
	if err := channel.ExchangeDeclare(deadletter, "topic", true, false, false, false, nil); err != nil {
		return err
	}
	if _, err := channel.QueueDeclare(deadletter, true, false, false, false, amqp.Table{"x-message-ttl": int32(604800000)}); err != nil {
		return err
	}
	if err := channel.QueueBind(deadletter, "#", deadletter, false, nil); err != nil {
		return err
	}
	return channel.ExchangeDeclare(p.platform("better.service9.broadcast.direct"), "direct", false, false, false, false, nil)
}
func (p *Plugin) declare(channel *amqp.Channel, name string, ttl int, exclusive bool) error {
	_, err := channel.QueueDeclare(name, !exclusive, exclusive, exclusive, false, amqp.Table{"x-message-ttl": int32(ttl), "x-expires": int32(ttl), "x-dead-letter-exchange": p.platform("better.service9.deadletter")})
	return err
}
func (p *Plugin) Init(ctx context.Context, obs bsb.Observable) error {
	p.ctx, p.cancel = context.WithCancel(ctx)
	p.obs = obs
	// Separate producer and consumer connections preserve delivery during listener outages.
	if _, err := p.connection(true); err != nil {
		return err
	}
	if _, err := p.connection(false); err != nil {
		return err
	}
	for _, entry := range []struct {
		kind    string
		handler handler
	}{{"91kr", p.reply}, {"91se", p.streamControl}, {"91sd", p.streamData}} {
		queue, err := p.queue(entry.kind, p.id)
		if err != nil {
			return err
		}
		if err = p.consume(queue, 60000, true, "", true, entry.handler); err != nil {
			return err
		}
	}
	obs.Log().Info("RabbitMQ connected; reply and stream consumers ready")
	return nil
}
func (p *Plugin) Run(context.Context, bsb.Observable) error { return nil }
func (p *Plugin) consume(name string, ttl int, exclusive bool, routing string, ordered bool, handle handler) error {
	setup := func() (*amqp.Channel, <-chan amqp.Delivery, error) {
		connection, err := p.connection(false)
		if err != nil {
			return nil, nil, err
		}
		channel, err := connection.Channel()
		if err != nil {
			return nil, nil, err
		}
		closeOnError := func(err error) (*amqp.Channel, <-chan amqp.Delivery, error) { channel.Close(); return nil, nil, err }
		if err = p.topology(channel); err != nil {
			return closeOnError(err)
		}
		if err = p.declare(channel, name, ttl, exclusive); err != nil {
			return closeOnError(err)
		}
		if routing != "" {
			if err = channel.QueueBind(name, routing, p.platform("better.service9.broadcast.direct"), false, nil); err != nil {
				return closeOnError(err)
			}
		}
		prefetch := p.config.Prefetch
		if ordered {
			prefetch = 1
		}
		if err = channel.Qos(prefetch, 0, false); err != nil {
			return closeOnError(err)
		}
		deliveries, err := channel.ConsumeWithContext(p.ctx, name, "", false, false, false, false, nil)
		if err != nil {
			return closeOnError(err)
		}
		return channel, deliveries, nil
	}
	channel, deliveries, err := setup()
	if err != nil {
		return err
	}
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		channel.Close()
		return fmt.Errorf("Rabbit transport closed")
	}
	p.workers.Add(1)
	p.mu.Unlock()
	go func() {
		defer p.workers.Done()
		// ponytail: poison counts are process-local; broker delivery limits are needed to retain them across restarts.
		attempts := map[string]int{}
		var attemptMu sync.Mutex
		deliver := func(message amqp.Delivery) {
			key := message.MessageId
			if key == "" {
				key = fmt.Sprintf("%x", sha256.Sum256(message.Body))
			}
			var body map[string]any
			var err error
			if len(message.Body) > 16*1024*1024 {
				err = fmt.Errorf("AMQP payload exceeds 16 MiB")
			} else {
				err = json.Unmarshal(message.Body, &body)
				if err == nil && body == nil {
					err = fmt.Errorf("AMQP payload must be an object")
				}
			}
			if err == nil {
				err = handle(message, body)
			}
			attemptMu.Lock()
			defer attemptMu.Unlock()
			if err == nil {
				delete(attempts, key)
				_ = message.Ack(false)
				return
			}
			attempt := attempts[key] + 1
			if attempt < 10 {
				if len(attempts) >= 10000 {
					for old := range attempts {
						delete(attempts, old)
						break
					}
				}
				attempts[key] = attempt
			} else {
				delete(attempts, key)
			}
			p.obs.Log().Warn("Rabbit delivery failed", map[string]any{"queue": name, "attempt": attempt})
			_ = message.Nack(false, attempt < 10)
		}
		for {
			count := p.config.Prefetch
			if ordered {
				count = 1
			}
			var handlers sync.WaitGroup
			for i := 0; i < count; i++ {
				handlers.Add(1)
				go func() {
					defer handlers.Done()
					for message := range deliveries {
						deliver(message)
					}
				}()
			}
			handlers.Wait()
			channel.Close()
			if p.ctx.Err() != nil {
				return
			}
			if p.config.FatalOnDisconnect {
				p.fail(fmt.Errorf("Rabbit consumer closed"))
				return
			}
			for {
				select {
				case <-p.ctx.Done():
					return
				case <-time.After(time.Second):
				}
				channel, deliveries, err = setup()
				if err == nil {
					break
				}
			}
		}
	}()
	return nil
}
func (p *Plugin) publish(ctx context.Context, queue string, body any, ttl int, correlation string, declareTTL int, broadcast bool) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	if len(data) > 16*1024*1024 {
		return fmt.Errorf("AMQP payload exceeds 16 MiB")
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	p.publishMu.Lock()
	defer p.publishMu.Unlock()
	if p.ctx.Err() != nil {
		return p.ctx.Err()
	}
	if p.publisher == nil || p.publisher.IsClosed() {
		connection, err := p.connection(true)
		if err != nil {
			return err
		}
		channel, err := connection.Channel()
		if err != nil {
			return err
		}
		if err = p.topology(channel); err != nil {
			channel.Close()
			return err
		}
		if err = channel.Confirm(false); err != nil {
			channel.Close()
			return err
		}
		p.publisher = channel
		p.returns = channel.NotifyReturn(make(chan amqp.Return, 1))
	}
	if declareTTL > 0 {
		if err = p.declare(p.publisher, queue, declareTTL, false); err != nil {
			return err
		}
	}
	exchange := ""
	if broadcast {
		exchange = p.platform("better.service9.broadcast.direct")
	}
	confirmation, err := p.publisher.PublishWithDeferredConfirmWithContext(ctx, exchange, queue, !broadcast, false, amqp.Publishing{ContentType: "application/json", Body: data, DeliveryMode: amqp.Persistent, MessageId: uuid.NewString(), AppId: p.id, CorrelationId: correlation, Expiration: strconv.Itoa(ttl), Timestamp: time.Now()})
	if err != nil {
		return err
	}
	if confirmation == nil {
		return fmt.Errorf("Rabbit confirmation unavailable")
	}
	accepted, err := confirmation.WaitContext(ctx)
	if err != nil {
		p.publisher.Close()
		return err
	}
	if !accepted {
		return fmt.Errorf("Rabbit publication rejected")
	}
	select {
	case returned := <-p.returns:
		return fmt.Errorf("Rabbit message unroutable: %d", returned.ReplyCode)
	default:
		return nil
	}
}
func (p *Plugin) incoming(body map[string]any, plugin, event string) (context.Context, bsb.Observable, any, error) {
	args, ok := body["args"].([]any)
	if !ok || len(args) > 1 {
		return nil, nil, nil, fmt.Errorf("typed events require one payload")
	}
	trace := bsb.NewDTrace()
	if raw, ok := body["trace"].(map[string]any); ok {
		if id, ok := raw["t"].(string); ok && len(id) == 32 {
			trace.TraceID = id
		}
	}
	obs := p.obs.WithTrace(trace, plugin).StartSpan("events.receive", map[string]any{"event": event})
	var payload any
	if len(args) == 1 {
		payload = args[0]
	}
	return bsb.WithObservable(p.ctx, obs), obs, payload, nil
}
func (p *Plugin) reply(message amqp.Delivery, body map[string]any) error {
	correlation := message.CorrelationId
	reject := strings.HasSuffix(correlation, "-reject")
	suffix := "-resolve"
	if reject {
		suffix = "-reject"
	}
	if !strings.HasSuffix(correlation, suffix) {
		return fmt.Errorf("invalid RPC correlation")
	}
	p.mu.Lock()
	pending := p.pending[strings.TrimSuffix(correlation, suffix)]
	p.mu.Unlock()
	if pending != nil {
		result := rpcResult{value: body["result"]}
		if reject {
			result.err = fmt.Errorf("remote handler: %v", body["error"])
		}
		select {
		case pending <- result:
		default:
		}
	}
	return nil
}
func (p *Plugin) OnEvent(ctx context.Context, obs bsb.Observable, plugin, event string, listener bsb.EventListener) error {
	return p.listen(plugin, event, listener, false)
}
func (p *Plugin) OnBroadcast(ctx context.Context, obs bsb.Observable, plugin, event string, listener bsb.BroadcastListener) error {
	return p.listen(plugin, event, bsb.EventListener(listener), true)
}
func (p *Plugin) listen(plugin, event string, listener bsb.EventListener, broadcast bool) error {
	kind := "91eq"
	if broadcast {
		kind = "91eb"
	}
	route, err := p.queue(kind, plugin, event)
	if err != nil {
		return err
	}
	name := route
	routing := ""
	if broadcast {
		name += "-" + uuid.NewString()
		routing = route
	}
	return p.consume(name, 3600000, broadcast, routing, false, func(message amqp.Delivery, body map[string]any) error {
		ctx, obs, payload, err := p.incoming(body, plugin, event)
		if err != nil {
			return err
		}
		defer obs.End()
		return listener(ctx, obs, payload)
	})
}
func (p *Plugin) EmitEvent(ctx context.Context, obs bsb.Observable, plugin, event string, payload any) error {
	queue, err := p.queue("91eq", plugin, event)
	if err != nil {
		return err
	}
	return p.publish(ctx, queue, map[string]any{"trace": obs.Trace(), "args": []any{payload}}, 3600000, "", 3600000, false)
}
func (p *Plugin) EmitBroadcast(ctx context.Context, obs bsb.Observable, plugin, event string, payload any) error {
	queue, err := p.queue("91eb", plugin, event)
	if err != nil {
		return err
	}
	return p.publish(ctx, queue, map[string]any{"trace": obs.Trace(), "args": []any{payload}}, 3600000, "", 0, true)
}
func (p *Plugin) OnReturnableEvent(ctx context.Context, obs bsb.Observable, plugin, event string, listener bsb.ReturnableListener) error {
	queue, err := p.queue("91ar", plugin, event)
	if err != nil {
		return err
	}
	return p.consume(queue, 60000, false, "", false, func(message amqp.Delivery, body map[string]any) error {
		if message.AppId == "" || message.CorrelationId == "" {
			return fmt.Errorf("RPC sender and correlation are required")
		}
		ctx, span, payload, err := p.incoming(body, plugin, event)
		if err != nil {
			return err
		}
		defer span.End()
		value, err := listener(ctx, span, payload)
		reply := map[string]any{"trace": span.Trace(), "result": value}
		outcome := "resolve"
		if err != nil {
			reply = map[string]any{"trace": span.Trace(), "error": err.Error()}
			outcome = "reject"
		}
		destination, err := p.queue("91kr", message.AppId)
		if err != nil {
			return err
		}
		// The consumer acknowledges only after this confirmed response publication.
		return p.publish(ctx, destination, reply, 5000, message.CorrelationId+"-"+outcome, 0, false)
	})
}
func (p *Plugin) EmitEventAndReturn(ctx context.Context, obs bsb.Observable, plugin, event string, timeout time.Duration, payload any) (any, error) {
	if timeout <= 0 {
		return nil, fmt.Errorf("RPC timeout must be positive")
	}
	queue, err := p.queue("91ar", plugin, event)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	id := uuid.NewString()
	pending := make(chan rpcResult, 1)
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return nil, fmt.Errorf("Rabbit transport closed")
	}
	p.pending[id] = pending
	p.mu.Unlock()
	defer func() { p.mu.Lock(); delete(p.pending, id); p.mu.Unlock() }()
	if err = p.publish(ctx, queue, map[string]any{"trace": obs.Trace(), "args": []any{payload}}, int(timeout.Milliseconds()+5000), id, 60000, false); err != nil {
		return nil, err
	}
	select {
	case result := <-pending:
		return result.value, result.err
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-p.ctx.Done():
		return nil, fmt.Errorf("Rabbit transport closed")
	}
}
func (p *Plugin) Dispose() error {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return nil
	}
	p.closed = true
	p.mu.Unlock()
	if p.cancel != nil {
		p.cancel()
	}
	p.connMu.Lock()
	var errs []error
	for _, connection := range []*amqp.Connection{p.receiveConn, p.publishConn} {
		if connection != nil && !connection.IsClosed() {
			errs = append(errs, connection.CloseDeadline(time.Now().Add(5*time.Second)))
		}
	}
	p.connMu.Unlock()
	done := make(chan struct{})
	go func() { p.workers.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		errs = append(errs, fmt.Errorf("Rabbit handlers did not stop within 5 seconds"))
	}
	return errors.Join(errs...)
}
