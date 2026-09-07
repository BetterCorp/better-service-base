package bsb

import (
	"math"
	"slices"
	"sync"
	"sync/atomic"
)

// Counter is a monotonically increasing metric.
type Counter struct {
	name        string
	description string
	help        string
	value       atomic.Int64
	onChange    func(int64)
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
	if d < 0 {
		panic("counter increments must be nonnegative")
	}
	value := c.value.Add(d)
	if c.onChange != nil {
		c.onChange(value)
	}
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
	value       atomic.Uint64 // IEEE 754 bits
	onChange    func(float64)
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
	if math.IsNaN(value) || math.IsInf(value, 0) {
		panic("gauge value must be finite")
	}
	g.value.Store(math.Float64bits(value))
	if g.onChange != nil {
		g.onChange(value)
	}
}

// Increment adds to the gauge (default 1).
func (g *Gauge) Increment(delta ...float64) {
	d := 1.0
	if len(delta) > 0 {
		d = delta[0]
	}
	value := addFloat(&g.value, d)
	if g.onChange != nil {
		g.onChange(value)
	}
}

// Decrement subtracts from the gauge (default 1).
func (g *Gauge) Decrement(delta ...float64) {
	d := 1.0
	if len(delta) > 0 {
		d = delta[0]
	}
	value := addFloat(&g.value, -d)
	if g.onChange != nil {
		g.onChange(value)
	}
}

// Value returns the current gauge value.
func (g *Gauge) Value() float64 {
	return math.Float64frombits(g.value.Load())
}

// Name returns the gauge name.
func (g *Gauge) Name() string { return g.name }

// Histogram records value distributions.
type Histogram struct {
	name        string
	description string
	help        string
	boundaries  []float64
	mu          sync.Mutex
	buckets     []atomic.Int64
	count       atomic.Int64
	sum         atomic.Uint64
	onChange    func(int64, float64, []int64, []float64)
}

// NewHistogram creates a new histogram metric.
func NewHistogram(name, description, help string, boundaries []float64) *Histogram {
	if len(boundaries) == 0 {
		boundaries = []float64{5, 10, 25, 50, 75, 100, 250, 500, 750, 1000}
	}
	for i, boundary := range boundaries {
		if math.IsNaN(boundary) || math.IsInf(boundary, 0) || (i > 0 && boundary <= boundaries[i-1]) {
			panic("histogram boundaries must be finite and strictly increasing")
		}
	}
	return &Histogram{
		name:        name,
		description: description,
		help:        help,
		boundaries:  slices.Clone(boundaries),
		buckets:     make([]atomic.Int64, len(boundaries)+1),
	}
}

// Record observes a value in the histogram.
func (h *Histogram) Record(value float64) {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		panic("histogram value must be finite")
	}
	h.mu.Lock()
	defer func() {
		// Export one consistent snapshot without holding the lock during callbacks.
		count, sum := h.Count(), h.Sum()
		var buckets []int64
		if h.onChange != nil {
			buckets = make([]int64, len(h.buckets))
			for i := range h.buckets {
				buckets[i] = h.buckets[i].Load()
			}
		}
		h.mu.Unlock()
		if h.onChange != nil {
			h.onChange(count, sum, buckets, slices.Clone(h.boundaries))
		}
	}()
	addFloat(&h.sum, value)
	h.count.Add(1)
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
	return math.Float64frombits(h.sum.Load())
}

// Name returns the histogram name.
func (h *Histogram) Name() string { return h.name }

func addFloat(target *atomic.Uint64, delta float64) float64 {
	if math.IsNaN(delta) || math.IsInf(delta, 0) {
		panic("metric delta must be finite")
	}
	for {
		old := target.Load()
		next := math.Float64frombits(old) + delta
		if math.IsInf(next, 0) {
			panic("metric overflow")
		}
		if target.CompareAndSwap(old, math.Float64bits(next)) {
			return next
		}
	}
}
