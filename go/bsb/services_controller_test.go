package bsb

import (
	"strings"
	"testing"
)

func TestTopologicalSortSimple(t *testing.T) {
	services := []*sortedService{
		{name: "b", initAfterPlugins: []string{"a"}},
		{name: "a"},
		{name: "c", initAfterPlugins: []string{"b"}},
	}

	sorted, err := topologicalSort(services, nil, true)
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

	sorted, err := topologicalSort(services, nil, true)
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

	_, err := topologicalSort(services, nil, true)
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
	sorted, err := topologicalSort(nil, nil, true)
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

	sorted, err := topologicalSort(services, nil, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sorted[0].name != "db" {
		t.Errorf("expected 'db' first in run order, got %q", sorted[0].name)
	}
}

func TestTopologicalSortLogicalAliases(t *testing.T) {
	services := []*sortedService{{name: "api", initAfterPlugins: []string{"database"}}, {name: "db-one", logicalName: "database"}, {name: "db-two", logicalName: "database"}}
	ordered, err := topologicalSort(services, nil, true)
	if err != nil || ordered[len(ordered)-1].name != "api" {
		t.Fatalf("logical dependency did not include all instances: %v %v", ordered, err)
	}
	services[1].initAfterPlugins = []string{"database"}
	if _, err = topologicalSort(services, nil, true); err == nil {
		t.Fatal("logical self-dependency must fail")
	}
}

func TestTopologicalSortRejectsUnknownDependenciesAndAllowsDisabledTargets(t *testing.T) {
	known := map[string]bool{"disabled-alias": true, "disabled-plugin": false}
	dependencies := []struct {
		name    string
		set     func(*sortedService, string)
		forInit bool
	}{
		{"init before", func(s *sortedService, dep string) { s.initBeforePlugins = []string{dep} }, true},
		{"init after", func(s *sortedService, dep string) { s.initAfterPlugins = []string{dep} }, true},
		{"run before", func(s *sortedService, dep string) { s.runBeforePlugins = []string{dep} }, false},
		{"run after", func(s *sortedService, dep string) { s.runAfterPlugins = []string{dep} }, false},
	}
	for _, dependency := range dependencies {
		t.Run(dependency.name, func(t *testing.T) {
			for _, target := range []string{"disabled-alias", "disabled-plugin"} {
				service := &sortedService{name: "active"}
				dependency.set(service, target)
				if _, err := topologicalSort([]*sortedService{service}, known, dependency.forInit); err != nil {
					t.Fatalf("configured disabled target %q rejected: %v", target, err)
				}
			}
			service := &sortedService{name: "active"}
			dependency.set(service, "missing")
			if _, err := topologicalSort([]*sortedService{service}, known, dependency.forInit); err == nil || !strings.Contains(err.Error(), "missing") {
				t.Fatalf("unknown dependency was not identified: %v", err)
			}
		})
	}
}

func TestTopologicalSortDisabledAliasWinsOverLogicalName(t *testing.T) {
	services := []*sortedService{{name: "active", initAfterPlugins: []string{"disabled"}}, {name: "other", logicalName: "disabled"}}
	ordered, err := topologicalSort(services, map[string]bool{"active": true, "disabled": true, "other": true}, true)
	if err != nil || ordered[0].name != "active" {
		t.Fatalf("disabled explicit alias did not remain authoritative: %v %v", ordered, err)
	}
}
