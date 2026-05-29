package bsb

import "fmt"

// BSBError is the framework's standard error type with trace context.
type BSBError struct {
	Trace   DTrace
	Message string
	Meta    map[string]any
	Cause   error
}

// Error implements the error interface.
func (e *BSBError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("BSBError[%s]: %s: %v", e.Trace, e.Message, e.Cause)
	}
	return fmt.Sprintf("BSBError[%s]: %s", e.Trace, e.Message)
}

// Unwrap returns the underlying cause for errors.Is/As support.
func (e *BSBError) Unwrap() error {
	return e.Cause
}

// NewBSBError creates a new BSBError with trace context.
func NewBSBError(trace DTrace, message string, meta map[string]any) *BSBError {
	return &BSBError{
		Trace:   trace,
		Message: message,
		Meta:    meta,
	}
}

// WrapBSBError wraps an existing error with BSB context.
func WrapBSBError(trace DTrace, message string, cause error) *BSBError {
	return &BSBError{
		Trace:   trace,
		Message: message,
		Cause:   cause,
	}
}

// ValidationError is raised when event schema validation fails.
type ValidationError struct {
	EventName string
	Direction string // "input" or "output"
	Issues    []string
	Cause     error
}

// Error implements the error interface.
func (e *ValidationError) Error() string {
	return fmt.Sprintf("validation error on %s %s: %v", e.EventName, e.Direction, e.Issues)
}

// Unwrap returns the underlying cause.
func (e *ValidationError) Unwrap() error {
	return e.Cause
}

// PluginNotFoundError is raised when a requested plugin is not registered.
type PluginNotFoundError struct {
	PluginType PluginType
	PluginName string
}

// Error implements the error interface.
func (e *PluginNotFoundError) Error() string {
	return fmt.Sprintf("plugin not found: %s/%s", e.PluginType, e.PluginName)
}

// DependencyCycleError is raised when plugin dependencies form a cycle.
type DependencyCycleError struct {
	Plugins []string
}

// Error implements the error interface.
func (e *DependencyCycleError) Error() string {
	return fmt.Sprintf("dependency cycle detected among plugins: %v", e.Plugins)
}
