package bsb

// BSBPreset provides pre-configured option sets.
type BSBPreset int

const (
	PresetMinimal BSBPreset = iota
	PresetDevelopment
	PresetProduction
)

// BSBOptions configures the ServiceBase.
type BSBOptions struct {
	// Cwd is the working directory for the application.
	Cwd string

	// Mode is the debug/runtime mode.
	Mode DebugMode

	// AppID is a unique identifier for this application instance.
	// Auto-generated if empty.
	AppID string

	// Region is the optional deployment region.
	Region string

	// ConfigPlugin overrides the config plugin name (default: "config-default").
	ConfigPlugin string

	// ConfigFile overrides the config file path.
	ConfigFile string
}

// ResolvedOptions returns options with defaults applied.
func (o BSBOptions) ResolvedOptions() BSBOptions {
	if o.Cwd == "" {
		o.Cwd = "."
	}
	if o.Mode == "" {
		o.Mode = ModeDevelopment
	}
	if o.AppID == "" {
		o.AppID = generateAppID()
	}
	if o.ConfigPlugin == "" {
		o.ConfigPlugin = "config-default"
	}
	return o
}

// OptionsFromPreset creates BSBOptions from a preset.
func OptionsFromPreset(preset BSBPreset, cwd string) BSBOptions {
	opts := BSBOptions{Cwd: cwd}
	switch preset {
	case PresetMinimal:
		opts.Mode = ModeProduction
	case PresetDevelopment:
		opts.Mode = ModeDevelopment
	case PresetProduction:
		opts.Mode = ModeProduction
	}
	return opts
}

// generateAppID creates a unique application identifier.
func generateAppID() string {
	return newSpanID()[:12]
}
