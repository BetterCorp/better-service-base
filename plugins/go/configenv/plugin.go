package configenv

import (
	"context"
	"fmt"
	"github.com/bettercorp/service-base/go/bsb"
	"os"
)

type Plugin struct{ bsb.JSONConfig }

func (p *Plugin) Init(context.Context, bsb.Observable) error {
	data := os.Getenv("BSB_CONFIG_JSON")
	if len(data) > 4*1024*1024 {
		return fmt.Errorf("BSB_CONFIG_JSON exceeds 4 MiB")
	}
	return p.LoadDocument([]byte(data), os.Getenv("BSB_PROFILE"))
}
func Register(registry *bsb.PluginRegistry) {
	registry.RegisterConfig("config-env", func(map[string]any) (bsb.ConfigPlugin, error) { return &Plugin{}, nil })
}
