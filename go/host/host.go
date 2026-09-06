// Package host owns the BSB executable lifecycle for built-in and linked plugins.
package host

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/bettercorp/service-base/go/bsb"
	"github.com/bettercorp/service-base/go/plugins/configdefault"
	"github.com/bettercorp/service-base/go/plugins/configenv"
	"github.com/bettercorp/service-base/go/plugins/configvault"
	"github.com/bettercorp/service-base/go/plugins/eventsdefault"
	"github.com/bettercorp/service-base/go/plugins/eventsrabbitmq"
	"github.com/bettercorp/service-base/go/plugins/observabledefault"
)

func NewRegistry() *bsb.PluginRegistry {
	registry := bsb.NewPluginRegistry()
	configdefault.Register(registry)
	configenv.Register(registry)
	configvault.Register(registry)
	eventsdefault.Register(registry)
	eventsrabbitmq.Register(registry)
	observabledefault.Register(registry)
	return registry
}
func Run(ctx context.Context, registry *bsb.PluginRegistry, args []string) error {
	if len(args) > 0 && args[0] == "export" {
		exports, err := registry.ExportContracts()
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(exports)
	}
	if len(args) > 0 && args[0] != "run" {
		return fmt.Errorf("unknown command %q", args[0])
	}
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	options := bsb.BSBOptions{Cwd: cwd, Mode: bsb.DebugMode(os.Getenv("BSB_MODE")), AppID: os.Getenv("BSB_APP_ID"), Region: os.Getenv("BSB_REGION"), ConfigPlugin: os.Getenv("BSB_CONFIG_PLUGIN")}
	return bsb.NewServiceBase(options, registry).RunAndWait(ctx)
}
func Main(registry *bsb.PluginRegistry) {
	if err := Run(context.Background(), registry, os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "BSB:", err)
		os.Exit(1)
	}
}
