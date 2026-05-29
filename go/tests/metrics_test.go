package tests

import (
	"testing"

	"github.com/bettercorp/service-base/go/bsb"
)

func TestCounter(t *testing.T) {
	c := bsb.NewCounter("test_counter", "test", "help")
	if c.Value() != 0 {
		t.Errorf("expected 0, got %d", c.Value())
	}
	c.Increment()
	if c.Value() != 1 {
		t.Errorf("expected 1, got %d", c.Value())
	}
	c.Increment(5)
	if c.Value() != 6 {
		t.Errorf("expected 6, got %d", c.Value())
	}
	if c.Name() != "test_counter" {
		t.Errorf("expected name 'test_counter', got %q", c.Name())
	}
}

func TestGauge(t *testing.T) {
	g := bsb.NewGauge("test_gauge", "test", "help")
	g.Set(42.5)
	if g.Value() != 42.5 {
		t.Errorf("expected 42.5, got %f", g.Value())
	}
	g.Increment()
	if g.Value() != 43.5 {
		t.Errorf("expected 43.5, got %f", g.Value())
	}
	g.Decrement(3.5)
	if g.Value() != 40 {
		t.Errorf("expected 40, got %f", g.Value())
	}
}

func TestHistogram(t *testing.T) {
	h := bsb.NewHistogram("test_hist", "test", "help", []float64{10, 50, 100})
	h.Record(5)
	h.Record(25)
	h.Record(75)
	h.Record(200)

	if h.Count() != 4 {
		t.Errorf("expected count 4, got %d", h.Count())
	}
	expectedSum := 305.0
	if h.Sum() != expectedSum {
		t.Errorf("expected sum %f, got %f", expectedSum, h.Sum())
	}
}
