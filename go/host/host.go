// Package host owns the BSB executable lifecycle for built-in and linked plugins.
package host

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/bettercorp/service-base/go/bsb"
	"github.com/bettercorp/service-base/go/plugins/configdefault"
	"github.com/bettercorp/service-base/go/plugins/configenv"
	"github.com/bettercorp/service-base/go/plugins/configvault"
	"github.com/bettercorp/service-base/go/plugins/eventsdefault"
	"github.com/bettercorp/service-base/go/plugins/eventsrabbitmq"
	"github.com/bettercorp/service-base/go/plugins/observabledefault"
	"github.com/bettercorp/service-base/go/plugins/observablenative"
	"github.com/bettercorp/service-base/go/tooling"
)

func NewRegistry() *bsb.PluginRegistry {
	registry := bsb.NewPluginRegistry()
	configdefault.Register(registry)
	configenv.Register(registry)
	configvault.Register(registry)
	eventsdefault.Register(registry)
	eventsrabbitmq.Register(registry)
	observabledefault.Register(registry)
	observablenative.Register(registry)
	registerBuiltinContracts(registry)
	return registry
}
func Run(ctx context.Context, registry *bsb.PluginRegistry, args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	if len(args) >= 2 && args[0] == "plugin" && args[1] == "build" {
		path, err := tooling.BuildHost(ctx, cwd)
		if err == nil {
			fmt.Println(path)
		}
		return err
	}
	if len(args) >= 2 && args[0] == "plugin" && args[1] == "export" {
		args = []string{"export"}
	}
	if len(args) >= 2 && args[0] == "client" {
		return clientCommand(ctx, cwd, args[1:])
	}
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
	options := bsb.BSBOptions{Cwd: cwd, Mode: bsb.DebugMode(os.Getenv("BSB_MODE")), AppID: os.Getenv("BSB_APP_ID"), Region: os.Getenv("BSB_REGION"), ConfigPlugin: os.Getenv("BSB_CONFIG_PLUGIN")}
	return bsb.NewServiceBase(options, registry).RunAndWait(ctx)
}

func clientCommand(ctx context.Context, cwd string, args []string) error {
	command := args[0]
	flags := map[string]string{}
	positional := []string{}
	for index := 1; index < len(args); index++ {
		arg := args[index]
		if !strings.HasPrefix(arg, "--") {
			positional = append(positional, arg)
			continue
		}
		key := strings.TrimPrefix(arg, "--")
		if key == "allow-insecure-http" {
			flags[key] = "true"
			continue
		}
		switch key {
		case "source-language", "version", "target", "token", "org", "plugin":
		default:
			return fmt.Errorf("unknown option %s", arg)
		}
		index++
		if index >= len(args) {
			return fmt.Errorf("missing value for %s", arg)
		}
		flags[key] = args[index]
	}
	if command == "sync" {
		files, err := tooling.SyncClients(cwd)
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(files)
	}
	registry, err := tooling.NewRegistry(flags["target"], flags["token"], flags["allow-insecure-http"] == "true" || os.Getenv("BSB_REGISTRY_ALLOW_INSECURE_HTTP") == "true")
	if err != nil {
		return err
	}
	var result any
	switch command {
	case "publish":
		result, err = registry.Publish(ctx, cwd, flags["org"], flags["plugin"], flags["target"] != "")
	case "list":
		result, err = registry.Request(ctx, "GET", "/plugins?limit=100", nil)
	case "info", "schema", "install":
		if len(positional) != 1 {
			return fmt.Errorf("%s requires a plugin ID", command)
		}
		switch command {
		case "info":
			result, err = registry.Info(ctx, positional[0], flags["source-language"])
		case "schema":
			result, err = registry.Schema(ctx, positional[0], flags["source-language"], flags["version"])
		case "install":
			result, err = registry.Install(ctx, cwd, positional[0], flags["source-language"], flags["version"])
		}
	default:
		return fmt.Errorf("unknown client command %s", command)
	}
	if err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(result)
}
func Main(registry *bsb.PluginRegistry) {
	if err := Run(context.Background(), registry, os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "BSB:", err)
		os.Exit(1)
	}
}
