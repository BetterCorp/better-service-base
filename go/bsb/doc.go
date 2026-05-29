// Package bsb provides the Better Service Base framework for building
// plugin-oriented, event-driven services with unified observability.
//
// The framework follows a strict lifecycle: config -> observable -> events -> services.
// All inter-plugin communication is handled via typed events through the event bus.
//
// Plugin types:
//   - ConfigPlugin: provides configuration to other plugins
//   - ObservablePlugin: provides logging, metrics, and tracing
//   - EventsPlugin: provides the event bus transport
//   - ServicePlugin: contains business logic
package bsb
