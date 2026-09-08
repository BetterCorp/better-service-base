package bsb

import (
	"fmt"
	"math"
	"strings"
	"unicode"
)

type PortableEvent struct {
	Category    string          `json:"category"`
	Type        string          `json:"type"`
	Input       *SchemaDocument `json:"inputSchema"`
	Output      *SchemaDocument `json:"outputSchema"`
	Description string          `json:"description"`
	Timeout     float64         `json:"defaultTimeout"`
}
type PortableContract struct {
	PluginID     string                   `json:"pluginId"`
	PluginName   string                   `json:"pluginName"`
	Version      string                   `json:"version"`
	Events       map[string]PortableEvent `json:"events"`
	Source       map[string]any           `json:"source,omitempty"`
	Capabilities map[string]any           `json:"capabilities,omitempty"`
}

var FlipEventCategory = map[string]string{"emitEvents": "onEvents", "onEvents": "emitEvents", "emitReturnableEvents": "onReturnableEvents", "onReturnableEvents": "emitReturnableEvents", "emitBroadcast": "onBroadcast", "onBroadcast": "emitBroadcast"}

func ImportEventSchemas(data []byte, flip bool) (BSBEventSchemas, error) {
	result := NewEventSchemas()
	var contract PortableContract
	if err := DecodeJSON(data, &contract); err != nil {
		return result, err
	}
	if contract.Events == nil {
		return result, fmt.Errorf("contract events must be an object")
	}
	for name, event := range contract.Events {
		category := event.Category
		if flip {
			category = FlipEventCategory[category]
		}
		if name == "" || strings.IndexFunc(name, unicode.IsControl) >= 0 {
			return result, fmt.Errorf("invalid event name")
		}
		if event.Input == nil {
			return result, fmt.Errorf("event input schema required")
		}
		input, err := ImportSchema(event.Input)
		if err != nil {
			return result, fmt.Errorf("%s input schema: %w", name, err)
		}
		switch category {
		case "onEvents", "emitEvents":
			if event.Type != "fire-and-forget" {
				return result, fmt.Errorf("invalid event type for %s", name)
			}
			schema := CreateFireAndForgetEvent(input, event.Description)
			if category == "onEvents" {
				result.OnEvents[name] = schema
			} else {
				result.EmitEvents[name] = schema
			}
		case "onBroadcast", "emitBroadcast":
			if event.Type != "broadcast" {
				return result, fmt.Errorf("invalid broadcast type for %s", name)
			}
			schema := CreateBroadcastEvent(input, event.Description)
			if category == "onBroadcast" {
				result.OnBroadcast[name] = schema
			} else {
				result.EmitBroadcast[name] = schema
			}
		case "onReturnableEvents", "emitReturnableEvents":
			if event.Type != "returnable" || event.Output == nil {
				return result, fmt.Errorf("returnable output schema required for %s", name)
			}
			output, err := ImportSchema(event.Output)
			if err != nil {
				return result, err
			}
			timeout := event.Timeout
			if timeout == 0 {
				timeout = 5
			}
			if timeout < 0 || timeout > 86400 || math.IsNaN(timeout) || math.IsInf(timeout, 0) {
				return result, fmt.Errorf("invalid event timeout")
			}
			schema := CreateReturnableEvent(input, output, event.Description, timeout)
			if category == "onReturnableEvents" {
				result.OnReturnableEvents[name] = schema
			} else {
				result.EmitReturnableEvents[name] = schema
			}
		default:
			return result, fmt.Errorf("unsupported event category %q", event.Category)
		}
	}
	return result, result.Validate()
}
