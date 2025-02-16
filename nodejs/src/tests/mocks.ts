/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd  
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program. 
 * The commercial license allows you to use the Program in a closed-source manner, 
 * including the right to create derivative works that are not subject to the terms 
 * of the AGPL. 
 *
 * To obtain a commercial license, please contact the copyright holders at 
 * https://www.bettercorp.dev. The terms and conditions of the commercial license 
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { DEBUG_MODE, BSBLoggingConstructor, SBMetrics, SBConfig, DTrace, SBLogging, SBEvents, SBPlugins, BSBEventsConstructor, PluginLogging } from "../index";
import { PluginMetrics } from "../base/PluginMetrics";
import { EventEmitter } from 'events';

export const MockSBLogging = (): SBLogging => {
  const fake = {
    logBus: new EventEmitter(),
    dispose: () => { },
    init: async () => { },
    run: async () => { },
  } as unknown as SBLogging;
  fake.logBus.on('error', (...args) => {}); // https://nodejs.org/api/events.html#error-events
  return fake;
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