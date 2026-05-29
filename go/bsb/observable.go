package bsb

// Observable provides unified access to logging, metrics, and tracing.
// Observable instances are immutable -- attribute methods return new instances.
type Observable interface {
	// Trace returns the distributed trace context.
	Trace() DTrace

	// TraceID returns the 32-char hex trace ID.
	TraceID() string

	// SpanID returns the 16-char hex span ID.
	SpanID() string

	// Resource returns the OpenTelemetry resource context.
	Resource() ResourceContext

	// Attributes returns the current attribute set.
	Attributes() map[string]any

	// Log returns the structured logger.
	Log() ObservableLog

	// Metrics returns the metrics factory.
	Metrics() ObservableMetrics

	// StartSpan creates a child span with a new span ID.
	StartSpan(name string, attributes ...map[string]any) Observable

	// SetAttribute returns a new Observable with the added attribute.
	SetAttribute(key string, value any) Observable

	// SetAttributes returns a new Observable with the added attributes.
	SetAttributes(attrs map[string]any) Observable

	// Error records an error to both logs and the active span.
	Error(err error, attributes ...map[string]any)

	// End finalizes the current span.
	End(attributes ...map[string]any)
}

// ObservableLog provides structured logging methods.
type ObservableLog interface {
	Debug(message string, meta ...map[string]any)
	Info(message string, meta ...map[string]any)
	Warn(message string, meta ...map[string]any)
	Error(message string, meta ...map[string]any)
}

// ObservableMetrics provides metric creation methods.
type ObservableMetrics interface {
	Counter(name, description, help string) *Counter
	Gauge(name, description, help string) *Gauge
	Histogram(name, description, help string, boundaries ...[]float64) *Histogram
	Timer() Timer
}

// ObservableBackendInterface is the internal contract for observable backends.
// Observable plugins and the framework implement this to receive log/metric/trace calls.
type ObservableBackendInterface interface {
	// Logging
	Debug(trace DTrace, pluginName, message string, meta map[string]any)
	Info(trace DTrace, pluginName, message string, meta map[string]any)
	Warn(trace DTrace, pluginName, message string, meta map[string]any)
	LogError(trace DTrace, pluginName, message string, meta map[string]any)

	// Metrics
	CreateCounter(pluginName, name, description, help string) *Counter
	CreateGauge(pluginName, name, description, help string) *Gauge
	CreateHistogram(pluginName, name, description, help string, boundaries []float64) *Histogram
	CreateTimer() Timer

	// Tracing
	StartSpan(trace DTrace, pluginName, name string, attributes map[string]any) (DTrace, string)
	EndSpan(trace DTrace, pluginName, spanID string, attributes map[string]any)
	ErrorSpan(trace DTrace, pluginName, spanID string, err error, attributes map[string]any)
}
