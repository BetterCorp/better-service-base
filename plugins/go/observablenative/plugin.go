// Package observablenative supplies native structured and remote observability backends.
package observablenative

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
)

type config struct {
	Level                 string            `json:"level"`
	Redact                []string          `json:"redact"`
	Base                  map[string]any    `json:"base"`
	PrettyPrint           bool              `json:"prettyPrint"`
	Path                  string            `json:"path"`
	FilePath              string            `json:"filePath"`
	MaxBytes              int64             `json:"maxBytes"`
	MaxFiles              int               `json:"maxFiles"`
	Interval              string            `json:"interval"`
	Compress              bool              `json:"compress"`
	Endpoint              string            `json:"endpoint"`
	ServiceName           string            `json:"serviceName"`
	ServiceVersion        string            `json:"serviceVersion"`
	Headers               map[string]string `json:"headers"`
	ResourceAttributes    map[string]string `json:"resourceAttributes"`
	FlushIntervalMS       int               `json:"flushIntervalMs"`
	MaxBatchSize          int               `json:"maxBatchSize"`
	SamplingRate          float64           `json:"samplingRate"`
	Logs                  bool              `json:"logs"`
	Metrics               bool              `json:"metrics"`
	Traces                bool              `json:"traces"`
	Token                 string            `json:"token"`
	Dataset               string            `json:"dataset"`
	OrgID                 string            `json:"orgId"`
	AllowInsecureHTTP     bool              `json:"allowInsecureHttp"`
	Host                  string            `json:"host"`
	Port                  int               `json:"port"`
	Protocol              string            `json:"protocol"`
	Facility              any               `json:"facility"`
	Hostname              string            `json:"hostname"`
	AppName               string            `json:"appName"`
	RFC                   string            `json:"rfc"`
	Framing               string            `json:"framing"`
	CACertificatePath     string            `json:"caCertificatePath"`
	ClientCertificatePath string            `json:"clientCertificatePath"`
	ClientKeyPath         string            `json:"clientKeyPath"`
	HTTPEndpoint          string            `json:"httpEndpoint"`
	AdditionalFields      map[string]any    `json:"additionalFields"`
}
type span struct {
	name, plugin, parent string
	trace                bsb.DTrace
	start                time.Time
	attributes           map[string]any
	err                  string
}
type Plugin struct {
	kind    string
	config  config
	mu      sync.Mutex
	spans   map[string]span
	file    *rotatingFile
	queue   chan map[string]any
	cancel  context.CancelFunc
	stop    chan struct{}
	done    chan struct{}
	once    sync.Once
	dropped atomic.Uint64
	started bool
	closed  bool
	network *networkWriter
}

var levels = map[string]int{"trace": 0, "debug": 1, "info": 2, "warn": 3, "error": 4, "fatal": 5}

func New(kind string, raw map[string]any) (bsb.ObservablePlugin, error) {
	hostname, _ := os.Hostname()
	options := config{Level: "info", MaxBytes: 10 * 1024 * 1024, MaxFiles: 7, Interval: "daily", Compress: true, ServiceName: "bsb-service", FlushIntervalMS: 5000, MaxBatchSize: 512, SamplingRate: 1, Logs: true, Metrics: true, Traces: true, Dataset: "bsb-logs", Host: "localhost", Port: 514, Protocol: "udp", Facility: float64(16), Hostname: hostname, AppName: "bsb-app", RFC: "5424", Framing: "newline"}
	switch kind {
	case "observable-opentelemetry":
		options.Endpoint = "http://localhost:4318"
	case "observable-axiom":
		options.Endpoint = "https://api.axiom.co"
	case "observable-zipkin":
		options.Endpoint = "http://localhost:9411/api/v2/spans"
	case "observable-graylog":
		options.Port = 12201
		options.Facility = "bsb"
	case "observable-logging-file":
		options.Path = "logs/application.log"
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}
	for key, value := range raw {
		if value == nil {
			return nil, fmt.Errorf("%s cannot be null", key)
		}
	}
	if string(data) != "null" {
		decoder := json.NewDecoder(strings.NewReader(string(data)))
		decoder.DisallowUnknownFields()
		if err = decoder.Decode(&options); err != nil {
			return nil, err
		}
	}
	if _, ok := levels[options.Level]; !ok {
		return nil, fmt.Errorf("invalid log level")
	}
	if options.MaxBytes < 1 || options.MaxFiles < 0 || options.FlushIntervalMS < 100 || options.FlushIntervalMS > 60000 || options.MaxBatchSize < 1 || options.MaxBatchSize > 4096 || options.SamplingRate < 0 || options.SamplingRate > 1 {
		return nil, fmt.Errorf("invalid logging or export bounds")
	}
	if options.Interval != "none" && options.Interval != "hourly" && options.Interval != "daily" {
		return nil, fmt.Errorf("invalid rotation interval")
	}
	return &Plugin{kind: kind, config: options, spans: map[string]span{}, queue: make(chan map[string]any, 4096), stop: make(chan struct{}), done: make(chan struct{})}, nil
}
func (p *Plugin) SetCwd(cwd string) {
	for _, path := range []*string{&p.config.Path, &p.config.FilePath, &p.config.CACertificatePath, &p.config.ClientCertificatePath, &p.config.ClientKeyPath} {
		if *path != "" && !filepath.IsAbs(*path) {
			*path = filepath.Join(cwd, *path)
		}
	}
}
func Register(registry *bsb.PluginRegistry) {
	for _, kind := range []string{"observable-logging-file", "observable-pino", "observable-winston", "observable-opentelemetry", "observable-axiom", "observable-zipkin", "observable-graylog", "observable-syslog"} {
		registry.RegisterObservable(kind, func(raw map[string]any) (bsb.ObservablePlugin, error) { return New(kind, raw) })
	}
}
func (p *Plugin) local() bool {
	return p.kind == "observable-logging-file" || p.kind == "observable-pino" || p.kind == "observable-winston"
}
func (p *Plugin) Init(ctx context.Context, obs bsb.Observable) error {
	if p.local() {
		path := p.config.FilePath
		if p.kind == "observable-logging-file" {
			path = p.config.Path
		}
		if path != "" {
			file, err := newRotatingFile(path, p.config)
			if err != nil {
				return err
			}
			p.file = file
		}
		return nil
	}
	if p.kind == "observable-graylog" || p.kind == "observable-syslog" {
		writer, err := newNetworkWriter(p.config, p.kind)
		if err != nil {
			return err
		}
		p.network = writer
	} else {
		if err := p.validateHTTP(); err != nil {
			return err
		}
	}
	return p.Run(ctx, obs)
}
func (p *Plugin) Run(context.Context, bsb.Observable) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.started || p.closed || p.local() {
		return nil
	}
	p.started = true
	ctx, cancel := context.WithCancel(context.Background())
	p.cancel = cancel
	go func() {
		defer close(p.done)
		ticker := time.NewTicker(time.Duration(p.config.FlushIntervalMS) * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-p.stop:
				p.flush(ctx)
				return
			case <-ticker.C:
				p.flush(ctx)
			case <-ctx.Done():
				return
			}
		}
	}()
	return nil
}
func (p *Plugin) flush(ctx context.Context) {
	for len(p.queue) > 0 {
		batch := []map[string]any{}
		for len(batch) < p.config.MaxBatchSize {
			select {
			case entry := <-p.queue:
				batch = append(batch, entry)
			default:
				goto send
			}
		}
	send:
		if err := p.export(ctx, batch); err != nil {
			fmt.Fprintf(os.Stderr, "[%s] export failed for %d entries\n", p.kind, len(batch))
		}
		if ctx.Err() != nil {
			return
		}
	}
}
func (p *Plugin) enqueue(entry map[string]any) {
	data, err := json.Marshal(entry)
	if err != nil || len(data) > 64*1024 {
		p.dropped.Add(1)
		fmt.Fprintln(os.Stderr, "BSB telemetry entry rejected: encoding or 64 KiB limit")
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return
	}
	select {
	case p.queue <- entry:
	default:
		count := p.dropped.Add(1)
		if count%1000 == 1 {
			fmt.Fprintf(os.Stderr, "[%s] telemetry queue full; dropped %d entries\n", p.kind, count)
		}
	}
}
func (p *Plugin) Dispose() error {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return nil
	}
	p.closed = true
	started := p.started
	p.mu.Unlock()
	p.once.Do(func() { close(p.stop) })
	if started {
		select {
		case <-p.done:
		case <-time.After(10 * time.Second):
			p.cancel()
			<-p.done
		}
	}
	if p.network != nil {
		p.network.close()
	}
	if p.file != nil {
		return p.file.close()
	}
	return nil
}
func redact(value map[string]any, paths []string) map[string]any {
	data, err := json.Marshal(value)
	if err != nil {
		return map[string]any{"message": "[unserializable log entry]"}
	}
	var copy map[string]any
	if bsb.DecodeJSON(data, &copy) != nil {
		return map[string]any{}
	}
	var visit func(any, []string)
	visit = func(value any, parts []string) {
		if len(parts) == 0 {
			return
		}
		switch node := value.(type) {
		case map[string]any:
			for key, child := range node {
				if parts[0] == "*" || parts[0] == key {
					if len(parts) == 1 {
						node[key] = "[REDACTED]"
					} else {
						visit(child, parts[1:])
					}
				}
			}
		case []any:
			for index, child := range node {
				if parts[0] == "*" || parts[0] == fmt.Sprint(index) {
					if len(parts) == 1 {
						node[index] = "[REDACTED]"
					} else {
						visit(child, parts[1:])
					}
				}
			}
		}
	}
	for _, path := range paths {
		visit(copy, strings.Split(path, "."))
	}
	return copy
}
func (p *Plugin) log(level string, trace bsb.DTrace, plugin, message string, meta map[string]any) {
	p.mu.Lock()
	closed := p.closed
	p.mu.Unlock()
	if closed {
		return
	}
	if !p.config.Logs || levels[level] < levels[p.config.Level] || p.kind == "observable-zipkin" {
		return
	}
	entry := bsb.MergeConfig(p.config.Base, map[string]any{"signal": "logs", "level": level, "timestamp": time.Now().UTC().Format(time.RFC3339Nano), "plugin": plugin, "message": message, "meta": meta, "traceId": trace.TraceID, "spanId": trace.SpanID})
	entry = redact(entry, p.config.Redact)
	// Expand placeholders only after redaction so protected metadata cannot leak into the message.
	if text, ok := entry["message"].(string); ok {
		if fields, ok := entry["meta"].(map[string]any); ok {
			for key, value := range fields {
				text = strings.ReplaceAll(text, "{"+key+"}", fmt.Sprint(value))
			}
		}
		entry["message"] = text
	}
	if !p.local() {
		p.enqueue(entry)
		return
	}
	if p.kind == "observable-pino" {
		entry["level"] = (levels[level] + 1) * 10
		entry["msg"] = entry["message"]
		delete(entry, "message")
	}
	data, err := json.Marshal(entry)
	if err != nil {
		fmt.Fprintln(os.Stderr, "BSB logging encoding failed")
		return
	}
	if p.kind != "observable-logging-file" {
		if p.config.PrettyPrint {
			fmt.Fprintln(os.Stdout, entry["timestamp"], level, plugin, entry["message"], entry["msg"], entry["meta"])
		} else {
			fmt.Fprintln(os.Stdout, string(data))
		}
	}
	if p.file != nil {
		if err = p.file.write(append(data, '\n')); err != nil {
			fmt.Fprintln(os.Stderr, "BSB file logging failed:", err)
		}
	}
}
func (p *Plugin) OnDebug(t bsb.DTrace, n, m string, v map[string]any) { p.log("debug", t, n, m, v) }
func (p *Plugin) OnInfo(t bsb.DTrace, n, m string, v map[string]any)  { p.log("info", t, n, m, v) }
func (p *Plugin) OnWarn(t bsb.DTrace, n, m string, v map[string]any)  { p.log("warn", t, n, m, v) }
func (p *Plugin) OnError(t bsb.DTrace, n, m string, v map[string]any) { p.log("error", t, n, m, v) }
func (p *Plugin) OnSpanStart(parent bsb.DTrace, plugin, name, id string, attributes map[string]any) {
	if p.local() || !p.config.Traces || p.kind == "observable-graylog" || p.kind == "observable-syslog" {
		return
	}
	if len(parent.TraceID) < 8 {
		return
	}
	sample, err := strconv.ParseUint(parent.TraceID[:8], 16, 32)
	if err != nil || float64(sample)/4294967296 >= p.config.SamplingRate {
		return
	}
	data, err := json.Marshal(attributes)
	if err != nil || len(data) > 64*1024 {
		p.dropped.Add(1)
		return
	}
	var copied map[string]any
	if bsb.DecodeJSON(data, &copied) != nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed || len(p.spans) >= 4096 {
		p.dropped.Add(1)
		return
	}
	p.spans[id] = span{name: name, plugin: plugin, parent: parent.SpanID, trace: bsb.DTrace{TraceID: parent.TraceID, SpanID: id}, start: time.Now(), attributes: copied}
}
func (p *Plugin) OnSpanError(trace bsb.DTrace, plugin, id string, err error, attributes map[string]any) {
	p.mu.Lock()
	defer p.mu.Unlock()
	value, ok := p.spans[id]
	if ok {
		value.err = err.Error()
		value.attributes = bsb.MergeConfig(value.attributes, attributes)
		p.spans[id] = value
	}
}
func (p *Plugin) OnSpanEnd(trace bsb.DTrace, plugin, id string, attributes map[string]any) {
	p.mu.Lock()
	value, ok := p.spans[id]
	delete(p.spans, id)
	p.mu.Unlock()
	if !ok {
		return
	}
	entry := map[string]any{"signal": "traces", "name": value.name, "plugin": value.plugin, "traceId": value.trace.TraceID, "spanId": id, "parentSpanId": value.parent, "startedNs": fmt.Sprint(value.start.UnixNano()), "endedNs": fmt.Sprint(time.Now().UnixNano()), "attributes": bsb.MergeConfig(value.attributes, attributes), "error": value.err}
	p.enqueue(redact(entry, p.config.Redact))
}
