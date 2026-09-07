// Package configdefault loads JSON deployment profiles.
package configdefault

import (
	"context"
	"fmt"
	"github.com/bettercorp/service-base/go/bsb"
	"os"
	"path/filepath"
	"strings"
)

type Plugin struct {
	bsb.JSONConfig
	cwd, configFile string
}

func New(config map[string]any) (bsb.ConfigPlugin, error) {
	cwd, _ := config["cwd"].(string)
	if cwd == "" {
		cwd = "."
	}
	file, _ := config["configFile"].(string)
	if file == "" {
		file = os.Getenv("BSB_CONFIG_FILE")
	}
	return &Plugin{cwd: cwd, configFile: file}, nil
}
func (p *Plugin) Init(_ context.Context, _ bsb.Observable) error {
	file := p.configFile
	if file == "" {
		file = "sec-config.json"
	}
	if !filepath.IsAbs(file) {
		file = filepath.Join(p.cwd, file)
	}
	data, err := os.ReadFile(file)
	if err != nil {
		return fmt.Errorf("read configuration %s: %w", file, err)
	}
	if len(data) > 4*1024*1024 {
		return fmt.Errorf("configuration exceeds 4 MiB")
	}
	return p.LoadDocument(data, os.Getenv("BSB_PROFILE"))
}
func Register(registry *bsb.PluginRegistry) { registry.RegisterConfig("config-default", New) }
func CategoryFromPluginName(name string) string {
	for _, category := range []string{"service", "observable", "events", "config"} {
		if strings.HasPrefix(name, category+"-") {
			return category
		}
	}
	return "other"
}
