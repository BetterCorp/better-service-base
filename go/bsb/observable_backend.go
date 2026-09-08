package bsb

import (
	"fmt"
	"log/slog"
	"os"
	"slices"
	"strings"
	"sync"
	"time"
)

// ObservableBackend is the framework's internal observable implementation.
// It delegates to registered ObservablePlugin instances and provides fallback console logging.
type ObservableBackend struct {
	mode       DebugMode
	appID      string
	pluginName string
	logger     *slog.Logger

	mu         sync.RWMutex
	plugins    []ObservablePlugin
	counters   map[string]*Counter
	gauges     map[string]*Gauge
	histograms map[string]*Histogram
	metrics    map[string]metricDefinition
}

type metricDefinition struct {
	kind, description, help string
	boundaries              []float64
}

// NewObservableBackend creates the framework's observable backend.
func NewObservableBackend(mode DebugMode, appID, pluginName string) *ObservableBackend {
	level := slog.LevelInfo
	if mode == ModeDevelopment {
		level = slog.LevelDebug
	}
	handler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	return &ObservableBackend{
		mode:       mode,
		appID:      appID,
		pluginName: pluginName,
		logger:     slog.New(handler),
		counters:   make(map[string]*Counter),
		gauges:     make(map[string]*Gauge),
		histograms: make(map[string]*Histogram),
		metrics:    make(map[string]metricDefinition),
	}
}

// AddPlugin registers an observable plugin to receive log/metric/trace events.
func (b *ObservableBackend) AddPlugin(plugin ObservablePlugin) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.plugins = append(b.plugins, plugin)
}

// Debug logs at debug level (suppressed in production).
func (b *ObservableBackend) Debug(trace DTrace, pluginName, message string, meta map[string]any) {
	if b.mode == ModeProduction {
		return
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	if len(b.plugins) == 0 {
		b.logger.Debug(formatMessage(message, meta), "plugin", pluginName, "trace", trace.TraceID, "span", trace.SpanID)
	}
	for _, p := range b.plugins {
		p.OnDebug(trace, pluginName, message, meta)
	}
}

// Info logs at info level.
func (b *ObservableBackend) Info(trace DTrace, pluginName, message string, meta map[string]any) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if len(b.plugins) == 0 {
		b.logger.Info(formatMessage(message, meta), "plugin", pluginName, "trace", trace.TraceID, "span", trace.SpanID)
	}
	for _, p := range b.plugins {
		p.OnInfo(trace, pluginName, message, meta)
	}
}

// Warn logs at warning level.
func (b *ObservableBackend) Warn(trace DTrace, pluginName, message string, meta map[string]any) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if len(b.plugins) == 0 {
		b.logger.Warn(formatMessage(message, meta), "plugin", pluginName, "trace", trace.TraceID, "span", trace.SpanID)
	}
	for _, p := range b.plugins {
		p.OnWarn(trace, pluginName, message, meta)
	}
}

// LogError logs at error level.
func (b *ObservableBackend) LogError(trace DTrace, pluginName, message string, meta map[string]any) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if len(b.plugins) == 0 {
		b.logger.Error(formatMessage(message, meta), "plugin", pluginName, "trace", trace.TraceID, "span", trace.SpanID)
	}
	for _, p := range b.plugins {
		p.OnError(trace, pluginName, message, meta)
	}
}

// CreateCounter creates or returns an existing counter.
func (b *ObservableBackend) CreateCounter(pluginName, name, description, help string) *Counter {
	key := pluginName + ":" + name
	b.mu.Lock()
	defer b.mu.Unlock()
	b.registerMetric(key, metricDefinition{kind: "counter", description: description, help: help})
	if c, ok := b.counters[key]; ok {
		return c
	}
	c := NewCounter(name, description, help)
	started := fmt.Sprint(time.Now().UnixNano())
	c.onChange = func(value int64) {
		b.metric(pluginName, map[string]any{"kind": "counter", "name": name, "description": description, "unit": help, "value": value, "startedNs": started, "timestampNs": fmt.Sprint(time.Now().UnixNano())})
	}
	b.counters[key] = c
	return c
}

// CreateGauge creates or returns an existing gauge.
func (b *ObservableBackend) CreateGauge(pluginName, name, description, help string) *Gauge {
	key := pluginName + ":" + name
	b.mu.Lock()
	defer b.mu.Unlock()
	b.registerMetric(key, metricDefinition{kind: "gauge", description: description, help: help})
	if g, ok := b.gauges[key]; ok {
		return g
	}
	g := NewGauge(name, description, help)
	started := fmt.Sprint(time.Now().UnixNano())
	g.onChange = func(value float64) {
		b.metric(pluginName, map[string]any{"kind": "gauge", "name": name, "description": description, "unit": help, "value": value, "startedNs": started, "timestampNs": fmt.Sprint(time.Now().UnixNano())})
	}
	b.gauges[key] = g
	return g
}

// CreateHistogram creates or returns an existing histogram.
func (b *ObservableBackend) CreateHistogram(pluginName, name, description, help string, boundaries []float64) *Histogram {
	key := pluginName + ":" + name
	h := NewHistogram(name, description, help, boundaries)
	b.mu.Lock()
	defer b.mu.Unlock()
	definition := metricDefinition{kind: "histogram", description: description, help: help, boundaries: h.boundaries}
	b.registerMetric(key, definition)
	if existing, ok := b.histograms[key]; ok {
		return existing
	}
	started := fmt.Sprint(time.Now().UnixNano())
	h.onChange = func(count int64, sum float64, buckets []int64, boundaries []float64) {
		b.metric(pluginName, map[string]any{"kind": "histogram", "name": name, "description": description, "unit": help, "count": count, "sum": sum, "bucketCounts": buckets, "explicitBounds": boundaries, "startedNs": started, "timestampNs": fmt.Sprint(time.Now().UnixNano())})
	}
	b.histograms[key] = h
	return h
}

func (b *ObservableBackend) registerMetric(key string, definition metricDefinition) {
	if existing, ok := b.metrics[key]; ok {
		if existing.kind != definition.kind || existing.description != definition.description || existing.help != definition.help || !slices.Equal(existing.boundaries, definition.boundaries) {
			panic("metric already registered with conflicting definition")
		}
		return
	}
	definition.boundaries = slices.Clone(definition.boundaries)
	b.metrics[key] = definition
}

func (b *ObservableBackend) metric(plugin string, entry map[string]any) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, backend := range b.plugins {
		if exporter, ok := backend.(interface{ OnMetric(string, map[string]any) }); ok {
			exporter.OnMetric(plugin, entry)
		}
	}
}

// CreateTimer creates a new timer.
func (b *ObservableBackend) CreateTimer() Timer {
	return NewTimer()
}

// StartSpan starts a new child span.
func (b *ObservableBackend) StartSpan(trace DTrace, pluginName, name string, attributes map[string]any) (DTrace, string) {
	child := trace.NewSpan()
	spanID := child.SpanID
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, p := range b.plugins {
		p.OnSpanStart(trace, pluginName, name, spanID, attributes)
	}
	return child, spanID
}

// EndSpan ends an active span.
func (b *ObservableBackend) EndSpan(trace DTrace, pluginName, spanID string, attributes map[string]any) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, p := range b.plugins {
		p.OnSpanEnd(trace, pluginName, spanID, attributes)
	}
}

// ErrorSpan records an error on an active span.
func (b *ObservableBackend) ErrorSpan(trace DTrace, pluginName, spanID string, err error, attributes map[string]any) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, p := range b.plugins {
		p.OnSpanError(trace, pluginName, spanID, err, attributes)
	}
}

// CreateTrace creates a new root trace and returns an Observable.
func (b *ObservableBackend) CreateTrace(name string, pluginName string, resource ResourceContext, attributes map[string]any) Observable {
	trace := DTrace{TraceID: newTraceID()}
	trace, spanID := b.StartSpan(trace, pluginName, name, attributes)
	return &pluginObservable{
		trace:      trace,
		resource:   resource,
		backend:    b,
		pluginName: pluginName,
		attrs:      attributes,
		spanID:     spanID,
	}
}

// CreateObservable wraps an existing DTrace in an Observable.
func (b *ObservableBackend) CreateObservable(trace DTrace, pluginName string, resource ResourceContext) Observable {
	return NewObservable(trace, resource, b, pluginName)
}

// formatMessage replaces {key} placeholders in message with values from meta.
func formatMessage(message string, meta map[string]any) string {
	if meta == nil || len(meta) == 0 {
		return message
	}
	result := message
	for k, v := range meta {
		placeholder := "{" + k + "}"
		if strings.Contains(result, placeholder) {
			result = strings.ReplaceAll(result, placeholder, fmt.Sprintf("%v", v))
		}
	}
	return result
}

// BootstrapTrace creates a trace suitable for use during framework bootstrap
// before the full observable system is initialized.
func BootstrapTrace() DTrace {
	return NewDTrace()
}

// Timestamp returns the current time in nanoseconds for metrics.
func Timestamp() int64 {
	return time.Now().UnixNano()
}
