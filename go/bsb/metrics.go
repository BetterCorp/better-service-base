package bsb

import "sync/atomic"

// Counter is a monotonically increasing metric.
type Counter struct {
	name        string
	description string
	help        string
	value       atomic.Int64
}

// NewCounter creates a new counter metric.
func NewCounter(name, description, help string) *Counter {
	return &Counter{
		name:        name,
		description: description,
		help:        help,
	}
}

// Increment adds to the counter (default 1).
func (c *Counter) Increment(delta ...int64) {
	d := int64(1)
	if len(delta) > 0 {
		d = delta[0]
	}
	c.value.Add(d)
}

// Value returns the current counter value.
func (c *Counter) Value() int64 {
	return c.value.Load()
}

// Name returns the counter name.
func (c *Counter) Name() string { return c.name }

// Gauge is a metric that can go up and down.
type Gauge struct {
	name        string
	description string
	help        string
	value       atomic.Int64 // stored as fixed-point * 1000 for float precision
}

// NewGauge creates a new gauge metric.
func NewGauge(name, description, help string) *Gauge {
	return &Gauge{
		name:        name,
		description: description,
		help:        help,
	}
}

// Set sets the gauge value.
func (g *Gauge) Set(value float64) {
	g.value.Store(int64(value * 1000))
}

// Increment adds to the gauge (default 1).
func (g *Gauge) Increment(delta ...float64) {
	d := 1000.0
	if len(delta) > 0 {
		d = delta[0] * 1000
	}
	g.value.Add(int64(d))
}

// Decrement subtracts from the gauge (default 1).
func (g *Gauge) Decrement(delta ...float64) {
	d := 1000.0
	if len(delta) > 0 {
		d = delta[0] * 1000
	}
	g.value.Add(-int64(d))
}

// Value returns the current gauge value.
func (g *Gauge) Value() float64 {
	return float64(g.value.Load()) / 1000
}

// Name returns the gauge name.
func (g *Gauge) Name() string { return g.name }

// Histogram records value distributions.
type Histogram struct {
	name        string
	description string
	help        string
	boundaries  []float64
	buckets     []atomic.Int64
	count       atomic.Int64
	sum         atomic.Int64 // stored as fixed-point * 1000
}

// NewHistogram creates a new histogram metric.
func NewHistogram(name, description, help string, boundaries []float64) *Histogram {
	if len(boundaries) == 0 {
		boundaries = []float64{5, 10, 25, 50, 75, 100, 250, 500, 750, 1000}
	}
	return &Histogram{
		name:        name,
		description: description,
		help:        help,
		boundaries:  boundaries,
		buckets:     make([]atomic.Int64, len(boundaries)+1),
	}
}

// Record observes a value in the histogram.
func (h *Histogram) Record(value float64) {
	h.count.Add(1)
	h.sum.Add(int64(value * 1000))
	for i, boundary := range h.boundaries {
		if value <= boundary {
			h.buckets[i].Add(1)
			return
		}
	}
	h.buckets[len(h.boundaries)].Add(1)
}

// Count returns the total number of observations.
func (h *Histogram) Count() int64 {
	return h.count.Load()
}

// Sum returns the sum of all observed values.
func (h *Histogram) Sum() float64 {
	return float64(h.sum.Load()) / 1000
}

// Name returns the histogram name.
func (h *Histogram) Name() string { return h.name }
