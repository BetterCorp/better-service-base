package bsb

import (
	"fmt"
	"time"

	av "github.com/BetterCorp/AnyVali/sdk/go"
)

// EventValidationConfig controls how event payloads are validated.
type EventValidationConfig struct {
	Enabled                  bool    // default: true
	LogValidationErrors      bool    // default: true
	ThrowOnValidationFailure bool    // default: true
	PerformanceThresholdMs   float64 // default: 100
}

// DefaultEventValidationConfig returns the default validation configuration.
func DefaultEventValidationConfig() EventValidationConfig {
	return EventValidationConfig{
		Enabled:                  true,
		LogValidationErrors:      true,
		ThrowOnValidationFailure: true,
		PerformanceThresholdMs:   100,
	}
}

// ValidationResult holds the outcome of a single validation call.
type ValidationResult struct {
	Success bool
	Data    any
	Error   error
}

// EventValidator validates event payloads against anyvali schemas.
type EventValidator struct {
	config EventValidationConfig
	logger *ObservableBackend
}

// NewEventValidator creates an EventValidator with the given config and logger.
func NewEventValidator(config EventValidationConfig, logger *ObservableBackend) *EventValidator {
	return &EventValidator{
		config: config,
		logger: logger,
	}
}

// ValidateInput validates an event's input payload against the given schema.
func (ev *EventValidator) ValidateInput(eventName string, data any, schema av.Schema, trace DTrace) ValidationResult {
	return ev.validate("input", eventName, data, schema, trace)
}

// ValidateOutput validates an event's output payload against the given schema.
func (ev *EventValidator) ValidateOutput(eventName string, data any, schema av.Schema, trace DTrace) ValidationResult {
	return ev.validate("output", eventName, data, schema, trace)
}

// validate is the shared implementation for input and output validation.
func (ev *EventValidator) validate(direction, eventName string, data any, schema av.Schema, trace DTrace) ValidationResult {
	if !ev.config.Enabled {
		return ValidationResult{Success: true, Data: data}
	}

	if schema == nil {
		return ValidationResult{Success: true, Data: data}
	}

	start := time.Now()
	result := schema.SafeParse(data)
	durationMs := float64(time.Since(start).Nanoseconds()) / 1e6

	// Warn on slow validation.
	if durationMs > ev.config.PerformanceThresholdMs {
		if ev.logger != nil {
			ev.logger.Warn(trace, "EventValidator",
				fmt.Sprintf("event %s %s validation took %.2fms (threshold: %.2fms)",
					eventName, direction, durationMs, ev.config.PerformanceThresholdMs),
				map[string]any{
					"event":     eventName,
					"direction": direction,
					"durationMs": durationMs,
					"threshold": ev.config.PerformanceThresholdMs,
				},
			)
		}
	}

	if !result.Success {
		validationErr := &av.ValidationError{Issues: result.Issues}

		if ev.config.LogValidationErrors && ev.logger != nil {
			ev.logger.LogError(trace, "EventValidator",
				fmt.Sprintf("event %s %s validation failed: %s", eventName, direction, validationErr.Error()),
				map[string]any{
					"event":     eventName,
					"direction": direction,
					"issues":    result.Issues,
				},
			)
		}

		if ev.config.ThrowOnValidationFailure {
			return ValidationResult{
				Success: false,
				Data:    nil,
				Error:   validationErr,
			}
		}

		// Validation failed but ThrowOnValidationFailure is false: pass original data through.
		return ValidationResult{Success: true, Data: data}
	}

	return ValidationResult{
		Success: true,
		Data:    result.Data,
	}
}
