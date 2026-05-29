package bsb

// pluginObservable implements the Observable interface, wrapping trace context
// with resource information and an observable backend.
type pluginObservable struct {
	trace      DTrace
	resource   ResourceContext
	backend    ObservableBackendInterface
	pluginName string
	attrs      map[string]any
	spanID     string // ID of the span this observable owns (empty if none)
}

// NewObservable creates a new Observable with the given context.
func NewObservable(trace DTrace, resource ResourceContext, backend ObservableBackendInterface, pluginName string) Observable {
	return &pluginObservable{
		trace:      trace,
		resource:   resource,
		backend:    backend,
		pluginName: pluginName,
		attrs:      make(map[string]any),
	}
}

func (o *pluginObservable) Trace() DTrace             { return o.trace }
func (o *pluginObservable) TraceID() string            { return o.trace.TraceID }
func (o *pluginObservable) SpanID() string             { return o.trace.SpanID }
func (o *pluginObservable) Resource() ResourceContext   { return o.resource }

func (o *pluginObservable) Attributes() map[string]any {
	cp := make(map[string]any, len(o.attrs))
	for k, v := range o.attrs {
		cp[k] = v
	}
	return cp
}

func (o *pluginObservable) Log() ObservableLog {
	return &observableLog{obs: o}
}

func (o *pluginObservable) Metrics() ObservableMetrics {
	return &observableMetrics{obs: o}
}

func (o *pluginObservable) StartSpan(name string, attributes ...map[string]any) Observable {
	attrs := mergeAttrSlice(o.attrs, attributes)
	childTrace, spanID := o.backend.StartSpan(o.trace, o.pluginName, name, attrs)
	return &pluginObservable{
		trace:      childTrace,
		resource:   o.resource,
		backend:    o.backend,
		pluginName: o.pluginName,
		attrs:      attrs,
		spanID:     spanID,
	}
}

func (o *pluginObservable) SetAttribute(key string, value any) Observable {
	newAttrs := make(map[string]any, len(o.attrs)+1)
	for k, v := range o.attrs {
		newAttrs[k] = v
	}
	newAttrs[key] = value
	return &pluginObservable{
		trace:      o.trace,
		resource:   o.resource,
		backend:    o.backend,
		pluginName: o.pluginName,
		attrs:      newAttrs,
		spanID:     o.spanID,
	}
}

func (o *pluginObservable) SetAttributes(attrs map[string]any) Observable {
	newAttrs := make(map[string]any, len(o.attrs)+len(attrs))
	for k, v := range o.attrs {
		newAttrs[k] = v
	}
	for k, v := range attrs {
		newAttrs[k] = v
	}
	return &pluginObservable{
		trace:      o.trace,
		resource:   o.resource,
		backend:    o.backend,
		pluginName: o.pluginName,
		attrs:      newAttrs,
		spanID:     o.spanID,
	}
}

func (o *pluginObservable) Error(err error, attributes ...map[string]any) {
	attrs := mergeAttrSlice(o.attrs, attributes)
	o.backend.LogError(o.trace, o.pluginName, err.Error(), attrs)
	if o.spanID != "" {
		o.backend.ErrorSpan(o.trace, o.pluginName, o.spanID, err, attrs)
	}
}

func (o *pluginObservable) End(attributes ...map[string]any) {
	if o.spanID != "" {
		attrs := mergeAttrSlice(o.attrs, attributes)
		o.backend.EndSpan(o.trace, o.pluginName, o.spanID, attrs)
	}
}

// observableLog wraps a pluginObservable to provide the ObservableLog interface.
type observableLog struct {
	obs *pluginObservable
}

func (l *observableLog) Debug(message string, meta ...map[string]any) {
	l.obs.backend.Debug(l.obs.trace, l.obs.pluginName, message, firstOrNil(meta))
}

func (l *observableLog) Info(message string, meta ...map[string]any) {
	l.obs.backend.Info(l.obs.trace, l.obs.pluginName, message, firstOrNil(meta))
}

func (l *observableLog) Warn(message string, meta ...map[string]any) {
	l.obs.backend.Warn(l.obs.trace, l.obs.pluginName, message, firstOrNil(meta))
}

func (l *observableLog) Error(message string, meta ...map[string]any) {
	l.obs.backend.LogError(l.obs.trace, l.obs.pluginName, message, firstOrNil(meta))
}

// observableMetrics wraps a pluginObservable to provide the ObservableMetrics interface.
type observableMetrics struct {
	obs *pluginObservable
}

func (m *observableMetrics) Counter(name, description, help string) *Counter {
	return m.obs.backend.CreateCounter(m.obs.pluginName, name, description, help)
}

func (m *observableMetrics) Gauge(name, description, help string) *Gauge {
	return m.obs.backend.CreateGauge(m.obs.pluginName, name, description, help)
}

func (m *observableMetrics) Histogram(name, description, help string, boundaries ...[]float64) *Histogram {
	var b []float64
	if len(boundaries) > 0 {
		b = boundaries[0]
	}
	return m.obs.backend.CreateHistogram(m.obs.pluginName, name, description, help, b)
}

func (m *observableMetrics) Timer() Timer {
	return m.obs.backend.CreateTimer()
}

// mergeAttrSlice merges base attributes with optional additional attributes.
func mergeAttrSlice(base map[string]any, additional []map[string]any) map[string]any {
	if len(additional) == 0 || additional[0] == nil {
		cp := make(map[string]any, len(base))
		for k, v := range base {
			cp[k] = v
		}
		return cp
	}
	result := make(map[string]any, len(base)+len(additional[0]))
	for k, v := range base {
		result[k] = v
	}
	for k, v := range additional[0] {
		result[k] = v
	}
	return result
}

// firstOrNil returns the first map from a variadic slice, or nil.
func firstOrNil(maps []map[string]any) map[string]any {
	if len(maps) > 0 {
		return maps[0]
	}
	return nil
}
