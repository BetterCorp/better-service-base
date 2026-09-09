// Package builtins registers the native plugins bundled with the BSB Go host.
package builtins

import (
	"github.com/bettercorp/service-base/go/bsb"
	"github.com/bettercorp/service-base/plugins/go/configdefault"
	"github.com/bettercorp/service-base/plugins/go/configenv"
	"github.com/bettercorp/service-base/plugins/go/configvault"
	"github.com/bettercorp/service-base/plugins/go/eventsdefault"
	"github.com/bettercorp/service-base/plugins/go/eventsrabbitmq"
	"github.com/bettercorp/service-base/plugins/go/observabledefault"
	"github.com/bettercorp/service-base/plugins/go/observablenative"
)

func Register(registry *bsb.PluginRegistry) {
	configdefault.Register(registry)
	configenv.Register(registry)
	configvault.Register(registry)
	eventsdefault.Register(registry)
	eventsrabbitmq.Register(registry)
	observabledefault.Register(registry)
	observablenative.Register(registry)
	registerContracts(registry)
}
