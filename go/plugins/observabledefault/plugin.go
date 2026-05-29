// Package observabledefault provides the default observable plugin with colored
// console logging. It formats log output with ANSI colors matching the Node.js
// implementation. Tracing methods remain no-ops -- replace this plugin with an
// OpenTelemetry or Axiom plugin for production tracing.
package observabledefault

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
)

// ANSI color codes
const (
	colorReset   = "\033[0m"
	fgBlack      = "\033[30m"
	fgRed        = "\033[31m"
	fgWhite      = "\033[37m"
	bgBlack      = "\033[40m"
	bgRed        = "\033[41m"
	bgBlue       = "\033[44m"
	bgWhite      = "\033[47m"
)

// Plugin implements bsb.ObservablePlugin with colored console logging.
type Plugin struct {
	mode bsb.DebugMode
}

// New creates a new observable-default plugin. The config map may contain a
// "mode" key whose value is a string matching a bsb.DebugMode constant.
func New(config map[string]any) (bsb.ObservablePlugin, error) {
	mode := bsb.ModeProduction
	if config != nil {
		if modeVal, ok := config["mode"]; ok {
			if modeStr, ok := modeVal.(string); ok {
				switch bsb.DebugMode(modeStr) {
				case bsb.ModeProduction, bsb.ModeProductionDebug, bsb.ModeDevelopment:
					mode = bsb.DebugMode(modeStr)
				}
			}
		}
	}
	return &Plugin{mode: mode}, nil
}

// Init is a no-op.
func (p *Plugin) Init(_ context.Context, _ bsb.Observable) error { return nil }

// Run is a no-op.
func (p *Plugin) Run(_ context.Context, _ bsb.Observable) error { return nil }

// Dispose is a no-op.
func (p *Plugin) Dispose() error { return nil }

// OnDebug receives debug log events. Only prints in development mode.
func (p *Plugin) OnDebug(trace bsb.DTrace, pluginName, message string, meta map[string]any) {
	if p.mode == bsb.ModeProduction {
		return
	}
	formatted := interpolate(message, meta)
	levelTag := colorize("DEBUG", bgBlue, fgWhite)
	fmt.Println(formatLine(trace, levelTag, pluginName, formatted))
}

// OnInfo receives info log events.
func (p *Plugin) OnInfo(trace bsb.DTrace, pluginName, message string, meta map[string]any) {
	formatted := interpolate(message, meta)
	levelTag := "INFO"
	fmt.Println(formatLine(trace, levelTag, pluginName, formatted))
}

// OnWarn receives warning log events.
func (p *Plugin) OnWarn(trace bsb.DTrace, pluginName, message string, meta map[string]any) {
	formatted := interpolate(message, meta)
	levelTag := colorize("WARN", bgBlack, fgRed)
	fmt.Println(formatLine(trace, levelTag, pluginName, formatted))
}

// OnError receives error log events.
func (p *Plugin) OnError(trace bsb.DTrace, pluginName, message string, meta map[string]any) {
	formatted := interpolate(message, meta)
	levelTag := colorize("ERROR", bgRed, fgBlack)
	fmt.Println(formatLine(trace, levelTag, pluginName, formatted))
}

// OnSpanStart receives span start events (no-op).
func (p *Plugin) OnSpanStart(_ bsb.DTrace, _ string, _ string, _ string, _ map[string]any) {}

// OnSpanEnd receives span end events (no-op).
func (p *Plugin) OnSpanEnd(_ bsb.DTrace, _ string, _ string, _ map[string]any) {}

// OnSpanError receives span error events (no-op).
func (p *Plugin) OnSpanError(_ bsb.DTrace, _ string, _ string, _ error, _ map[string]any) {}

// Register registers the observable-default plugin with the given registry.
func Register(registry *bsb.PluginRegistry) {
	registry.RegisterObservable("observable-default", func(config map[string]any) (bsb.ObservablePlugin, error) {
		return New(config)
	})
}

// colorize wraps text with the given ANSI background and foreground codes.
func colorize(text, bg, fg string) string {
	return bg + fg + text + colorReset
}

// formatLine produces the standard log line format:
//
//	[TIMESTAMP] | [LEVEL] [PLUGIN_NAME] [traceID:spanID] message
func formatLine(trace bsb.DTrace, level, pluginName, message string) string {
	ts := time.Now().UTC().Format(time.RFC3339)
	return fmt.Sprintf("[%s] | [%s] [%s] [%s:%s] %s",
		ts, level, pluginName, trace.TraceID, trace.SpanID, message)
}

// interpolate replaces {key} placeholders in the message with values from meta.
func interpolate(message string, meta map[string]any) string {
	if len(meta) == 0 {
		return message
	}
	result := message
	for k, v := range meta {
		placeholder := "{" + k + "}"
		if strings.Contains(result, placeholder) {
			result = strings.ReplaceAll(result, placeholder, fmt.Sprintf("%v", v))
		}
	}
	return result
}
