package bsb

import (
	"testing"
)

func TestTopologicalSortSimple(t *testing.T) {
	services := []*sortedService{
		{name: "b", initAfterPlugins: []string{"a"}},
		{name: "a"},
		{name: "c", initAfterPlugins: []string{"b"}},
	}

	sorted, err := topologicalSort(services, true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// a should come first, then b, then c
	if sorted[0].name != "a" {
		t.Errorf("expected first to be 'a', got %q", sorted[0].name)
	}
	if sorted[1].name != "b" {
		t.Errorf("expected second to be 'b', got %q", sorted[1].name)
	}
	if sorted[2].name != "c" {
		t.Errorf("expected third to be 'c', got %q", sorted[2].name)
	}
}

func TestTopologicalSortBefore(t *testing.T) {
	services := []*sortedService{
		{name: "a", initBeforePlugins: []string{"c"}},
		{name: "b", initBeforePlugins: []string{"c"}},
		{name: "c"},
	}

	sorted, err := topologicalSort(services, true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// c should come last
	if sorted[2].name != "c" {
		t.Errorf("expected last to be 'c', got %q", sorted[2].name)
	}
}

func TestTopologicalSortCycleDetection(t *testing.T) {
	services := []*sortedService{
		{name: "a", initAfterPlugins: []string{"b"}},
		{name: "b", initAfterPlugins: []string{"a"}},
	}

	_, err := topologicalSort(services, true)
	if err == nil {
		t.Error("expected cycle detection error")
	}

	cycleErr, ok := err.(*DependencyCycleError)
	if !ok {
		t.Errorf("expected DependencyCycleError, got %T", err)
	}
	if len(cycleErr.Plugins) != 2 {
		t.Errorf("expected 2 cycled plugins, got %d", len(cycleErr.Plugins))
	}
}

func TestTopologicalSortEmpty(t *testing.T) {
	sorted, err := topologicalSort(nil, true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(sorted) != 0 {
		t.Errorf("expected empty result, got %d", len(sorted))
	}
}

func TestTopologicalSortRunDeps(t *testing.T) {
	services := []*sortedService{
		{name: "api", runAfterPlugins: []string{"db"}},
		{name: "db"},
	}

	sorted, err := topologicalSort(services, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sorted[0].name != "db" {
		t.Errorf("expected 'db' first in run order, got %q", sorted[0].name)
	}
}
