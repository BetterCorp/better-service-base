
import { DEBUG_MODE, BSBLoggingConstructor, SBMetrics, SBConfig, DTrace, SBLogging, SBEvents, SBPlugins, BSBEventsConstructor, PluginLogging } from "../index";
import { PluginMetrics } from "../base/PluginMetrics";
import { EventEmitter } from 'events';

export const MockSBLogging = (): SBLogging => {
  return {
    logBus: new EventEmitter(),
    dispose: () => { },
    init: async () => { },
    run: async () => { },
  } as unknown as SBLogging;
};

export const MockSBConfig = (): SBConfig => {
  const SB = {
    getMetricsPlugins: async () => ({}),
    getLoggingPlugins: async () => ({}),
    getEventsPlugins: async () => ({}),
    getServicePlugins: async () => ({}),
    getPluginConfig: async () => ({}),
    getServicePluginDefinition: async (trace: DTrace, pluginName: string) => ({ name: pluginName, enabled: true }),
    dispose: () => { },
    setConfigPlugin: async () => {
      return SB;
    },
    init: async () => { },
  } as unknown as SBConfig;
  return SB
};

export const MockSBMetrics = (): SBMetrics => {
  return {
    metricsBus: new EventEmitter(),
    dispose: () => { },
    init: async () => { },
    run: async () => { },
  } as unknown as SBMetrics;
};

export const MockSBEvents = (): SBEvents => {
  return {
    eventsBus: new EventEmitter(),
    dispose: () => { },
    init: async () => { },
    run: async () => { },
  } as unknown as SBEvents;
};

export const MockSBPlugins = (): SBPlugins => {
  return {
    getPlugins: async () => ({}),
    dispose: () => { },
    init: async () => { },
    run: async () => { },
  } as unknown as SBPlugins;
};

export const newSBMetrics = async () => {
  const metrics = new SBMetrics(
    "test-app",
    "development",
    process.cwd(),
    MockSBPlugins(),
    MockSBLogging()
  );
  await metrics.init(MockSBConfig());
  return metrics;
};

export const newMetrics = async () => {
  const metrics = await newSBMetrics();
  return new PluginMetrics("test-app", "test-plugin", metrics);
};

export const getLoggingConstructorConfig = (
  mode: DEBUG_MODE = "development",
): BSBLoggingConstructor => {
  return {
    appId: "test-app",
    packageCwd: process.cwd(),
    pluginCwd: process.cwd(),
    cwd: process.cwd(),
    mode: mode,
    pluginName: "test-plugin",
    pluginVersion: "0.0.0",
    config: undefined,
  };
};

export const getEventsConstructorConfig = async (
  config: any,
): Promise<BSBEventsConstructor> => {
  return {
    appId: "test-app",
    packageCwd: process.cwd(),
    pluginCwd: process.cwd(),
    cwd: process.cwd(),
    mode: "development",
    pluginName: "test-plugin",
    pluginVersion: "0.0.0",
    sbLogging: MockSBLogging(),
    sbMetrics: await newSBMetrics(),
    config: config,
  };
};

export const generateNullLogging = () => {
  const sbLogging = MockSBLogging();
  return new PluginLogging("development", "test-plugin", sbLogging);
};