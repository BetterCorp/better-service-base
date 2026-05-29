package bsb

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

// ServiceBase is the main framework orchestrator.
// It manages the lifecycle of all plugins: config -> observable -> events -> services.
type ServiceBase struct {
	opts    BSBOptions
	backend *ObservableBackend

	configCtrl     *ConfigController
	observableCtrl *ObservableController
	eventsCtrl     *EventsController
	servicesCtrl   *ServicesController
	registry       *PluginRegistry

	bootStart time.Time
	disposed  bool
	mu        sync.Mutex

	// Boot timing per phase (nanoseconds)
	phaseTiming map[string]time.Duration

	// Heartbeat
	heartbeatCancel context.CancelFunc
}

// NewServiceBase creates a new ServiceBase with the given options and plugin registry.
func NewServiceBase(opts BSBOptions, registry *PluginRegistry) *ServiceBase {
	resolved := opts.ResolvedOptions()
	backend := NewObservableBackend(resolved.Mode, resolved.AppID, "bsb")

	return &ServiceBase{
		opts:        resolved,
		backend:     backend,
		registry:    registry,
		phaseTiming: make(map[string]time.Duration),
		configCtrl: &ConfigController{
			backend:  backend,
			registry: registry,
			opts:     resolved,
		},
		observableCtrl: &ObservableController{
			backend:  backend,
			registry: registry,
			opts:     resolved,
		},
		eventsCtrl: &EventsController{
			backend:  backend,
			registry: registry,
			opts:     resolved,
		},
		servicesCtrl: &ServicesController{
			backend:  backend,
			registry: registry,
			opts:     resolved,
		},
	}
}

// Development creates a ServiceBase with development preset.
func Development(cwd string, registry *PluginRegistry) *ServiceBase {
	return NewServiceBase(OptionsFromPreset(PresetDevelopment, cwd), registry)
}

// Production creates a ServiceBase with production preset.
func Production(cwd string, registry *PluginRegistry) *ServiceBase {
	return NewServiceBase(OptionsFromPreset(PresetProduction, cwd), registry)
}

// Init initializes all plugins in order: config -> observable -> events -> services.
// Each phase is timed at nanosecond precision and logged in milliseconds.
func (sb *ServiceBase) Init(ctx context.Context) error {
	sb.bootStart = time.Now()
	trace := BootstrapTrace()
	obs := sb.backend.CreateObservable(trace, "bsb", BuildResourceContext("bsb", "9.0.0", sb.opts.AppID, sb.opts.Mode, sb.opts.Region))

	obs.Log().Info("ServiceBase initializing", map[string]any{
		"appId": sb.opts.AppID,
		"mode":  string(sb.opts.Mode),
		"cwd":   sb.opts.Cwd,
	})

	// Phase 1: Config
	phaseStart := time.Now()
	if err := sb.configCtrl.Init(ctx, obs); err != nil {
		return fmt.Errorf("config init failed: %w", err)
	}
	sb.phaseTiming["CONFIG"] = time.Since(phaseStart)
	obs.Log().Info("phase CONFIG completed", map[string]any{
		"durationMs": sb.phaseTiming["CONFIG"].Milliseconds(),
	})

	// Phase 2: Observable
	phaseStart = time.Now()
	if err := sb.observableCtrl.Init(ctx, obs, sb.configCtrl); err != nil {
		return fmt.Errorf("observable init failed: %w", err)
	}
	sb.phaseTiming["OBSERVABLE"] = time.Since(phaseStart)
	obs.Log().Info("phase OBSERVABLE completed", map[string]any{
		"durationMs": sb.phaseTiming["OBSERVABLE"].Milliseconds(),
	})

	// Phase 3: Events
	phaseStart = time.Now()
	if err := sb.eventsCtrl.Init(ctx, obs, sb.configCtrl); err != nil {
		return fmt.Errorf("events init failed: %w", err)
	}
	sb.phaseTiming["EVENTS"] = time.Since(phaseStart)
	obs.Log().Info("phase EVENTS completed", map[string]any{
		"durationMs": sb.phaseTiming["EVENTS"].Milliseconds(),
	})

	// Phase 4: Services
	phaseStart = time.Now()
	if err := sb.servicesCtrl.Init(ctx, obs, sb.configCtrl, sb.eventsCtrl, sb.backend); err != nil {
		return fmt.Errorf("services init failed: %w", err)
	}
	sb.phaseTiming["SERVICES"] = time.Since(phaseStart)
	obs.Log().Info("phase SERVICES completed", map[string]any{
		"durationMs": sb.phaseTiming["SERVICES"].Milliseconds(),
	})

	obs.Log().Info("ServiceBase initialized")
	return nil
}

// Run starts all plugins after initialization.
func (sb *ServiceBase) Run(ctx context.Context) error {
	trace := BootstrapTrace()
	obs := sb.backend.CreateObservable(trace, "bsb", BuildResourceContext("bsb", "9.0.0", sb.opts.AppID, sb.opts.Mode, sb.opts.Region))

	// Run observable plugins
	if err := sb.observableCtrl.Run(ctx, obs); err != nil {
		return fmt.Errorf("observable run failed: %w", err)
	}

	// Run events plugins
	if err := sb.eventsCtrl.Run(ctx, obs); err != nil {
		return fmt.Errorf("events run failed: %w", err)
	}

	// Run service plugins in dependency order
	if err := sb.servicesCtrl.Run(ctx, obs); err != nil {
		return fmt.Errorf("services run failed: %w", err)
	}

	bootTime := time.Since(sb.bootStart)

	// Record boot time as a gauge metric (milliseconds)
	bootGauge := obs.Metrics().Gauge("bsbBootTime", "Total boot time in milliseconds", "ms")
	bootGauge.Set(float64(bootTime.Milliseconds()))

	obs.Log().Info("ServiceBase running", map[string]any{
		"bootTimeMs": bootTime.Milliseconds(),
	})

	// Start heartbeat goroutine
	heartbeatCounter := obs.Metrics().Counter("bsbHeartbeat", "Heartbeat tick counter", "count")
	hbCtx, hbCancel := context.WithCancel(context.Background())
	sb.heartbeatCancel = hbCancel
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				heartbeatCounter.Increment()
			case <-hbCtx.Done():
				return
			}
		}
	}()

	return nil
}

// Dispose shuts down all plugins in reverse order.
func (sb *ServiceBase) Dispose() error {
	sb.mu.Lock()
	defer sb.mu.Unlock()

	if sb.disposed {
		return nil
	}
	sb.disposed = true

	// Stop the heartbeat goroutine
	if sb.heartbeatCancel != nil {
		sb.heartbeatCancel()
	}

	trace := BootstrapTrace()
	obs := sb.backend.CreateObservable(trace, "bsb", BuildResourceContext("bsb", "9.0.0", sb.opts.AppID, sb.opts.Mode, sb.opts.Region))
	obs.Log().Info("ServiceBase disposing")

	var errs []error

	// Reverse order: services -> events -> observable -> config
	if err := sb.servicesCtrl.Dispose(); err != nil {
		errs = append(errs, fmt.Errorf("services dispose: %w", err))
	}
	if err := sb.eventsCtrl.Dispose(); err != nil {
		errs = append(errs, fmt.Errorf("events dispose: %w", err))
	}
	if err := sb.observableCtrl.Dispose(); err != nil {
		errs = append(errs, fmt.Errorf("observable dispose: %w", err))
	}
	if err := sb.configCtrl.Dispose(); err != nil {
		errs = append(errs, fmt.Errorf("config dispose: %w", err))
	}

	if len(errs) > 0 {
		obs.Log().Error("ServiceBase disposed with errors", map[string]any{
			"errorCount": len(errs),
		})
		return fmt.Errorf("dispose errors: %v", errs)
	}

	obs.Log().Info("ServiceBase disposed")
	return nil
}

// WaitForShutdown blocks until a termination signal (SIGINT, SIGTERM) is received,
// then gracefully disposes the service.
func (sb *ServiceBase) WaitForShutdown() error {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	sig := <-sigChan
	slog.Info("shutdown signal received", "signal", sig)

	return sb.Dispose()
}

// RunAndWait is a convenience method that calls Init, Run, and WaitForShutdown.
func (sb *ServiceBase) RunAndWait(ctx context.Context) error {
	if err := sb.Init(ctx); err != nil {
		return err
	}
	if err := sb.Run(ctx); err != nil {
		_ = sb.Dispose()
		return err
	}
	return sb.WaitForShutdown()
}

// Options returns the resolved options.
func (sb *ServiceBase) Options() BSBOptions {
	return sb.opts
}

// Backend returns the observable backend for advanced usage.
func (sb *ServiceBase) Backend() *ObservableBackend {
	return sb.backend
}
