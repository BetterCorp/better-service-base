package bsb

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// PluginType identifies the category of a plugin.
type PluginType string

const (
	PluginTypeConfig     PluginType = "config"
	PluginTypeObservable PluginType = "observable"
	PluginTypeEvents     PluginType = "events"
	PluginTypeService    PluginType = "service"
)

// DebugMode represents the runtime debug level.
type DebugMode string

const (
	ModeProduction      DebugMode = "production"
	ModeProductionDebug DebugMode = "production-debug"
	ModeDevelopment     DebugMode = "development"
)

// DTrace carries distributed trace context (W3C compatible).
type DTrace struct {
	TraceID string // 32-char hex (128-bit)
	SpanID  string // 16-char hex (64-bit)
}

// NewDTrace creates a new root trace with fresh IDs.
func NewDTrace() DTrace {
	return DTrace{
		TraceID: newTraceID(),
		SpanID:  newSpanID(),
	}
}

// NewSpan creates a child span inheriting the trace ID.
func (d DTrace) NewSpan() DTrace {
	return DTrace{
		TraceID: d.TraceID,
		SpanID:  newSpanID(),
	}
}

// String returns a formatted trace string.
func (d DTrace) String() string {
	return fmt.Sprintf("%s:%s", d.TraceID, d.SpanID)
}

// PluginDefinition describes a plugin entry from configuration.
type PluginDefinition struct {
	Plugin  string         // Plugin identifier
	Enabled bool           // Whether the plugin is active
	Package string         // Optional package override
	Version string         // Optional version constraint
	Config  map[string]any // Plugin-specific configuration
}

// ServicePluginDefinition is the resolved definition for a service plugin.
type ServicePluginDefinition struct {
	Name    string
	Enabled bool
}

// PluginMetadata describes a plugin for registry and documentation.
type PluginMetadata struct {
	Name        string
	Description string
	Version     string
	Author      string
	License     string
	Homepage    string
	Repository  string
	Tags        []string
	Category    PluginType

	InitBeforePlugins []string
	InitAfterPlugins  []string
	RunBeforePlugins  []string
	RunAfterPlugins   []string
}

// ResourceContext holds OpenTelemetry semantic convention resource attributes.
type ResourceContext struct {
	ServiceName       string // service.name
	ServiceVersion    string // service.version
	ServiceInstanceID string // service.instance.id
	DeploymentEnv     string // deployment.environment
	DeploymentRegion  string // deployment.region (optional)
}

// Timer measures elapsed time with nanosecond precision.
type Timer struct {
	start time.Time
}

// NewTimer creates a started timer.
func NewTimer() Timer {
	return Timer{start: time.Now()}
}

// Stop returns the elapsed duration in milliseconds.
func (t Timer) Stop() float64 {
	return float64(time.Since(t.start).Nanoseconds()) / 1e6
}

// ElapsedDuration returns the elapsed time as a time.Duration.
func (t Timer) ElapsedDuration() time.Duration {
	return time.Since(t.start)
}

// newTraceID generates a 32-char hex trace ID from UUIDv7.
func newTraceID() string {
	id, err := uuid.NewV7()
	if err != nil {
		// Fallback to random bytes
		b := make([]byte, 16)
		_, _ = rand.Read(b)
		return hex.EncodeToString(b)
	}
	return hex.EncodeToString(id[:])
}

// newSpanID generates a 16-char hex span ID from crypto random.
func newSpanID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
