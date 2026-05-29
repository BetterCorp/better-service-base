package bsb

import (
	"fmt"

	av "github.com/BetterCorp/AnyVali/sdk/go"
)

// EventBrand distinguishes event schema types at runtime.
type EventBrand string

const (
	BrandFireAndForget EventBrand = "fire-and-forget"
	BrandReturnable    EventBrand = "returnable"
	BrandBroadcast     EventBrand = "broadcast"
)

// FireAndForgetEventSchema defines a fire-and-forget event.
type FireAndForgetEventSchema struct {
	Input       av.Schema
	Description string
	Brand       EventBrand
}

// ReturnableEventSchema defines a request/response event.
type ReturnableEventSchema struct {
	Input          av.Schema
	Output         av.Schema
	Description    string
	DefaultTimeout float64 // seconds
	Brand          EventBrand
}

// BroadcastEventSchema defines a broadcast event.
type BroadcastEventSchema struct {
	Input       av.Schema
	Description string
	Brand       EventBrand
}

// CreateFireAndForgetEvent creates a fire-and-forget event schema.
func CreateFireAndForgetEvent(input av.Schema, description ...string) FireAndForgetEventSchema {
	desc := ""
	if len(description) > 0 {
		desc = description[0]
	}
	return FireAndForgetEventSchema{
		Input:       input,
		Description: desc,
		Brand:       BrandFireAndForget,
	}
}

// CreateReturnableEvent creates a returnable (request/response) event schema.
func CreateReturnableEvent(input, output av.Schema, description string, defaultTimeout ...float64) ReturnableEventSchema {
	timeout := 5.0
	if len(defaultTimeout) > 0 {
		timeout = defaultTimeout[0]
	}
	return ReturnableEventSchema{
		Input:          input,
		Output:         output,
		Description:    description,
		DefaultTimeout: timeout,
		Brand:          BrandReturnable,
	}
}

// CreateBroadcastEvent creates a broadcast event schema.
func CreateBroadcastEvent(input av.Schema, description ...string) BroadcastEventSchema {
	desc := ""
	if len(description) > 0 {
		desc = description[0]
	}
	return BroadcastEventSchema{
		Input:       input,
		Description: desc,
		Brand:       BrandBroadcast,
	}
}

// BSBEventSchemas is the complete event schema container for a plugin.
type BSBEventSchemas struct {
	EmitEvents           map[string]FireAndForgetEventSchema
	OnEvents             map[string]FireAndForgetEventSchema
	EmitReturnableEvents map[string]ReturnableEventSchema
	OnReturnableEvents   map[string]ReturnableEventSchema
	EmitBroadcast        map[string]BroadcastEventSchema
	OnBroadcast          map[string]BroadcastEventSchema
}

// NewEventSchemas creates a new empty BSBEventSchemas.
func NewEventSchemas() BSBEventSchemas {
	return BSBEventSchemas{
		EmitEvents:           make(map[string]FireAndForgetEventSchema),
		OnEvents:             make(map[string]FireAndForgetEventSchema),
		EmitReturnableEvents: make(map[string]ReturnableEventSchema),
		OnReturnableEvents:   make(map[string]ReturnableEventSchema),
		EmitBroadcast:        make(map[string]BroadcastEventSchema),
		OnBroadcast:          make(map[string]BroadcastEventSchema),
	}
}

// Validate checks for duplicate event names across categories.
func (s BSBEventSchemas) Validate() error {
	seen := make(map[string]string) // event name -> category
	check := func(name, category string) error {
		if existing, ok := seen[name]; ok {
			return fmt.Errorf("duplicate event name %q found in both %s and %s", name, existing, category)
		}
		seen[name] = category
		return nil
	}
	for name := range s.EmitEvents {
		if err := check(name, "emitEvents"); err != nil {
			return err
		}
	}
	for name := range s.OnEvents {
		if err := check(name, "onEvents"); err != nil {
			return err
		}
	}
	for name := range s.EmitReturnableEvents {
		if err := check(name, "emitReturnableEvents"); err != nil {
			return err
		}
	}
	for name := range s.OnReturnableEvents {
		if err := check(name, "onReturnableEvents"); err != nil {
			return err
		}
	}
	for name := range s.EmitBroadcast {
		if err := check(name, "emitBroadcast"); err != nil {
			return err
		}
	}
	for name := range s.OnBroadcast {
		if err := check(name, "onBroadcast"); err != nil {
			return err
		}
	}
	return nil
}

// EventSchemaExport represents the exported form of event schemas for
// cross-language client generation.
type EventSchemaExport struct {
	PluginName string                    `json:"pluginName"`
	Version    string                    `json:"version"`
	Events     map[string]EventExportDef `json:"events"`
}

// EventExportDef is a single exported event definition.
type EventExportDef struct {
	Category    string    `json:"category"`
	Description string    `json:"description,omitempty"`
	Input       av.Schema `json:"input,omitempty"`
	Output      av.Schema `json:"output,omitempty"`
	Timeout     float64   `json:"timeout,omitempty"`
}

// ExportSchemas exports event schemas as a portable structure for code generation.
func ExportSchemas(pluginName, version string, schemas BSBEventSchemas) EventSchemaExport {
	export := EventSchemaExport{
		PluginName: pluginName,
		Version:    version,
		Events:     make(map[string]EventExportDef),
	}
	for name, s := range schemas.EmitEvents {
		export.Events[name] = EventExportDef{Category: "emitEvent", Description: s.Description, Input: s.Input}
	}
	for name, s := range schemas.OnEvents {
		export.Events[name] = EventExportDef{Category: "onEvent", Description: s.Description, Input: s.Input}
	}
	for name, s := range schemas.EmitReturnableEvents {
		export.Events[name] = EventExportDef{Category: "emitReturnableEvent", Description: s.Description, Input: s.Input, Output: s.Output, Timeout: s.DefaultTimeout}
	}
	for name, s := range schemas.OnReturnableEvents {
		export.Events[name] = EventExportDef{Category: "onReturnableEvent", Description: s.Description, Input: s.Input, Output: s.Output, Timeout: s.DefaultTimeout}
	}
	for name, s := range schemas.EmitBroadcast {
		export.Events[name] = EventExportDef{Category: "emitBroadcast", Description: s.Description, Input: s.Input}
	}
	for name, s := range schemas.OnBroadcast {
		export.Events[name] = EventExportDef{Category: "onBroadcast", Description: s.Description, Input: s.Input}
	}
	return export
}
