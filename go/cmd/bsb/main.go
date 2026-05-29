// Package main provides the BSB framework CLI entry point.
// It creates a ServiceBase, registers default plugins, and runs the service lifecycle.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/bettercorp/service-base/go/bsb"
	"github.com/bettercorp/service-base/go/plugins/configdefault"
	"github.com/bettercorp/service-base/go/plugins/eventsdefault"
	"github.com/bettercorp/service-base/go/plugins/observabledefault"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal error", "error", err)
		os.Exit(1)
	}
}

func run() error {
	// Determine mode from environment
	mode := bsb.ModeDevelopment
	if env := os.Getenv("BSB_MODE"); env == "production" {
		mode = bsb.ModeProduction
	}

	// Build options
	cwd, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get working directory: %w", err)
	}

	opts := bsb.BSBOptions{
		Cwd:    cwd,
		Mode:   mode,
		AppID:  os.Getenv("BSB_APP_ID"),
		Region: os.Getenv("BSB_REGION"),
	}

	// Create plugin registry and register defaults
	registry := bsb.NewPluginRegistry()
	configdefault.Register(registry)
	eventsdefault.Register(registry)
	observabledefault.Register(registry)

	// Register additional plugins here:
	// myservice.Register(registry)

	// Create and run the service
	sb := bsb.NewServiceBase(opts, registry)
	ctx := context.Background()

	return sb.RunAndWait(ctx)
}
