package bsb

// BuildResourceContext creates a ResourceContext from plugin and runtime information.
func BuildResourceContext(pluginName, version, appID string, mode DebugMode, region string) ResourceContext {
	env := "production"
	if mode == ModeDevelopment {
		env = "development"
	} else if mode == ModeProductionDebug {
		env = "production-debug"
	}
	return ResourceContext{
		ServiceName:       pluginName,
		ServiceVersion:    version,
		ServiceInstanceID: appID,
		DeploymentEnv:     env,
		DeploymentRegion:  region,
	}
}
