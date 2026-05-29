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

import { DEBUG_MODE, SBConfig, DTrace, SBEvents, SBPlugins, BSBEventsConstructor, ObservableBackend, BSBObservableConstructor, BSBConfigConstructor } from "@bsb/base";
import { EventEmitter } from 'events';
import { SBObservable } from "@bsb/base";
import { Observable } from "@bsb/base";
import { BSBError } from "@bsb/base";
import { LogMeta } from "@bsb/base";

export const MockSBObservable = (): SBObservable => {
  const observableBus = new EventEmitter();
  observableBus.on('error', (...args: any[]) => {}); // Prevent unhandled error events

  return {
    observableBus,
    isReady: true,

    // Logging methods - emit to bus
    debug: (plugin: string, trace: DTrace, message: string, meta: LogMeta<any>) => {
      observableBus.emit('debug', plugin, trace, message, meta);
    },
    info: (plugin: string, trace: DTrace, message: string, meta: LogMeta<any>) => {
      observableBus.emit('info', plugin, trace, message, meta);
    },
    warn: (plugin: string, trace: DTrace, message: string, meta: LogMeta<any>) => {
      observableBus.emit('warn', plugin, trace, message, meta);
    },
    error: (plugin: string, trace: DTrace, message: string | BSBError<any>, meta?: LogMeta<any>) => {
      observableBus.emit('error', plugin, trace, message, meta);
    },

    // Metrics methods - emit to bus
    createCounter: (timestamp: number, pluginName: string, name: string, description: string, help: string, labels?: string[]) => {
      observableBus.emit('createCounter', timestamp, pluginName, name, description, help, labels);
    },
    incrementCounter: (timestamp: number, pluginName: string, name: string, value: number, labels?: Record<string, string>) => {
      observableBus.emit('incrementCounter', timestamp, pluginName, name, value, labels);
    },
    createGauge: (timestamp: number, pluginName: string, name: string, description: string, help: string, labels?: string[]) => {
      observableBus.emit('createGauge', timestamp, pluginName, name, description, help, labels);
    },
    setGauge: (timestamp: number, pluginName: string, name: string, value: number, labels?: Record<string, string>) => {
      observableBus.emit('setGauge', timestamp, pluginName, name, value, labels);
    },
    createHistogram: (timestamp: number, pluginName: string, name: string, description: string, help: string, boundaries?: number[], labels?: string[]) => {
      observableBus.emit('createHistogram', timestamp, pluginName, name, description, help, boundaries, labels);
    },
    observeHistogram: (timestamp: number, pluginName: string, name: string, value: number, labels?: Record<string, string>) => {
      observableBus.emit('observeHistogram', timestamp, pluginName, name, value, labels);
    },

    // Span methods - emit to bus
    startSpan: (timestamp: number, appId: string, pluginName: string, traceId: string, parentSpanId: string | null, spanId: string, name: string, attributes?: Record<string, string | number | boolean>) => {
      observableBus.emit('spanStart', { t: traceId, s: spanId }, pluginName, name, attributes);
    },
    endSpan: (timestamp: number, appId: string, pluginName: string, traceId: string, spanId: string, attributes?: Record<string, string | number | boolean>) => {
      observableBus.emit('spanEnd', { t: traceId, s: spanId }, pluginName, attributes);
    },
    errorSpan: (timestamp: number, appId: string, pluginName: string, traceId: string, spanId: string, error: Error, attributes?: Record<string, string | number | boolean>) => {
      observableBus.emit('spanError', { t: traceId, s: spanId }, pluginName, error, attributes);
    },

    // Lifecycle methods
    setupObservablePlugins: async () => {},
    init: async () => {},
    run: async () => {},
    dispose: async () => {},
  } as unknown as SBObservable;
};

export const MockSBConfig = (): SBConfig => {
  const SB = {
    getObservablePlugins: async (obs: Observable) => ({}),
    getEventsPlugins: async (obs: Observable) => ({}),
    getServicePlugins: async (obs: Observable) => ({}),
    getPluginConfig: async (obs: Observable, pluginType: any, name: string) => null,
    getServicePluginDefinition: async (obs: Observable, pluginName: string) => ({ name: pluginName, enabled: true }),
    dispose: () => { },
    setConfigPlugin: async () => {
      return SB;
    },
    init: async () => { },
  } as unknown as SBConfig;
  return SB
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

export const newSBObservable = async () => {
  const observable = MockSBObservable();
  return observable;
};

export const newMetrics = async () => {
  const observable = await newSBObservable();
  return new ObservableBackend("development", "test-app", "test-plugin", observable);
};

export const getObservableConstructorConfig = (
  mode: DEBUG_MODE = "development",
): BSBObservableConstructor => {
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

export const getLoggingConstructorConfig = (
  mode: DEBUG_MODE = "development",
): BSBObservableConstructor => {
  return {
    appId: "test-app",
    packageCwd: process.cwd(),
    pluginCwd: process.cwd(),
    cwd: process.cwd(),
    mode: mode,
    pluginName: "logging-default",
    pluginVersion: "0.0.0",
    config: undefined,
  };
};

export const getConfigConstructorConfig = (
  config: any,
): BSBConfigConstructor => {
  return {
    appId: "test-app",
    packageCwd: process.cwd(),
    pluginCwd: process.cwd(),
    cwd: process.cwd(),
    mode: "development",
    pluginName: "config-default",
    pluginVersion: "0.0.0",
    sbObservable: MockSBObservable(),
    config: config,
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
    sbObservable: MockSBObservable(),
    config: config,
  };
};

export const generateNullLogging = () => {
  const sbObservable = MockSBObservable();
  return new ObservableBackend("development", "test-app", "test-plugin", sbObservable);
};
