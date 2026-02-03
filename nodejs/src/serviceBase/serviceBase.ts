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

import {
  BSBError,
  BSBService, MS_PER_NS, NS_PER_SEC,
  ObservableBackend, ResourceContextBuilder, PluginObservable,
} from "../base";
import { resolveBSBOptions, fromSimpleOptions, fromPreset } from "../base/factory";
import { Counter, createFakeDTrace, DEBUG_MODE, DTrace, Gauge, LogMeta, PluginTypeDefinitionRef, BSBOptions, SimpleBSBOptions, BSBPreset, Observable } from "../interfaces";
import { SBConfig } from "./config";
import { SBEvents } from "./events";
import { SBObservable } from "./observable";
import { SBPlugins } from "./plugins";
import { SBServices } from "./services";

/**
 * @hidden
 */
export const BOOT_STAT_KEYS = {
  BSB: "BSB",
  SELF: "SELF",
  CONFIG: "CONFIG",
  OBSERVABLE: "OBSERVABLE",
  EVENTS: "EVENTS",
  SERVICES: "SERVICES",
  INIT: "INIT",
  RUN: "RUN",
} as const;
/**
 * @hidden
 */
export type BootStatKeys = (typeof BOOT_STAT_KEYS)[keyof typeof BOOT_STAT_KEYS];

const TIMEKEEPLOG = "[TIMER] {timerName} took ({nsTime}ns) ({msTime}ms)";

/**
 * @hidden
 */
function internalTrace(span: string): DTrace {
  return createFakeDTrace("serviceBase/ServiceBase", span);
}

/**
 * Main entry point for the BSB framework.
 * 
 * This class is responsible for initializing and running the BSB framework.
 * You can override the default behaviour of the framework by passing in your own classes for the plugins, logging, metrics, events and services.
 * The passed in classes are not the plugins themselves, but rather the classes that handle the plugin creation, setup and running.
 * 
 * @group Main
 * @category Core
 */
export class ServiceBase {
  /**
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/ServiceBase.html | API: ServiceBase}
   */
  private readonly mode: DEBUG_MODE = "development";

  /**
   * Create a ServiceBase instance with simple configuration
   * 
   * @param simple - Simple configuration options
   * @returns New ServiceBase instance
   * 
   * @group Main
   * @category Factory
   * @example
   * ```typescript
   * const app = ServiceBase.create({
   *   cwd: './my-app',
   *   plugins: ['logging-default', 'events-default']
   * });
   * ```
   */
  static create(simple?: SimpleBSBOptions): ServiceBase {
    const options = fromSimpleOptions(simple);
    return new ServiceBase(options);
  }

  /**
   * Create a ServiceBase instance from a preset
   * 
   * @param preset - Preset configuration type
   * @param overrides - Additional options to override preset defaults
   * @returns New ServiceBase instance
   * 
   * @group Main
   * @category Factory
   * @example
   * ```typescript
   * const app = ServiceBase.fromPreset(BSBPreset.DEVELOPMENT, { 
   *   cwd: './my-app' 
   * });
   * ```
   */
  static fromPreset(preset: BSBPreset, overrides?: Partial<BSBOptions>): ServiceBase {
    const options = fromPreset(preset, overrides);
    return new ServiceBase(options);
  }

  /**
   * Create a minimal ServiceBase instance for quick prototyping
   * 
   * @param cwd - Working directory (defaults to process.cwd())
   * @returns New ServiceBase instance with minimal configuration
   * 
   * @group Main
   * @category Factory
   * @example
   * ```typescript
   * const app = ServiceBase.minimal('./my-app');
   * await app.init();
   * await app.run();
   * ```
   */
  static minimal(cwd?: string): ServiceBase {
    return ServiceBase.fromPreset(BSBPreset.MINIMAL, { cwd });
  }

  /**
   * Create a development ServiceBase instance with debug logging
   * 
   * @param cwd - Working directory (defaults to process.cwd())
   * @returns New ServiceBase instance configured for development
   * 
   * @group Main
   * @category Factory
   */
  static development(cwd?: string): ServiceBase {
    return ServiceBase.fromPreset(BSBPreset.DEVELOPMENT, { cwd });
  }

  /**
   * Create a production ServiceBase instance with optimized settings
   * 
   * @param cwd - Working directory (defaults to process.cwd())
   * @returns New ServiceBase instance configured for production
   * 
   * @group Main
   * @category Factory
   */
  static production(cwd?: string): ServiceBase {
    return ServiceBase.fromPreset(BSBPreset.PRODUCTION, { cwd });
  }

  private readonly _CORE_PLUGIN_NAME = "core";
  private readonly _appId;
  private readonly observable: SBObservable;
  private readonly plugins: SBPlugins;
  private readonly config: SBConfig;
  private readonly events: SBEvents;
  private readonly observableBackend: ObservableBackend;
  private readonly services!: SBServices;
  private readonly cwd!: string;

  private coreMetrics!: ObservableBackend;
  private heartBeatMetric!: Counter;
  private bsbBootTimeMetric!: Gauge;

  private _keeps?: Record<BootStatKeys, [number, number] | number> = {
    BSB: process.hrtime(),
  } as any;
  private _heartbeat!: ReturnType<typeof setInterval>;

  private _startKeep(stepName: BootStatKeys) {
    if (this._keeps === undefined) {
      throw new BSBError(internalTrace("TIMEKEEPER"), "Internal error with timekeeper!");
    }
    if (this.observableBackend !== undefined) {
      this.observableBackend.debug(internalTrace("TIMEKEEPER"), "Starting timer for {log}", { log: stepName });
    }
    this._keeps[stepName] = process.hrtime();
  }

  private _outputKeep(stepName: BootStatKeys) {
    if (this._keeps === undefined) {
      throw new BSBError(internalTrace("TIMEKEEPER"), "Internal error with timekeeper!");
    }
    if (typeof this._keeps[stepName] === "number") {
      throw new BSBError(internalTrace("TIMEKEEPER"), "Internal error with timekeeper!");
    }
    const diff = process.hrtime((
      this._keeps[stepName] || undefined
    ) as [number, number] | undefined);
    this._keeps[stepName] = (
      diff[0] * NS_PER_SEC + diff[1]
    ) * MS_PER_NS;
    const logMeta: LogMeta<typeof TIMEKEEPLOG> = {
      nsTime: diff[0] * NS_PER_SEC + diff[1],
      msTime: this._keeps[stepName],
      timerName: stepName,
    };
    this.observableBackend.info(internalTrace("TIMEKEEPER"), TIMEKEEPLOG, logMeta);
  }

  /**
   * Creates a new ServiceBase instance to orchestrate the BSB framework.
   *
   * The ServiceBase is the main entry point for running BSB applications. It initializes
   * and coordinates all subsystems including configuration, logging, metrics, events,
   * and service plugins.
   *
   * @param options - Configuration options for the ServiceBase instance
   * @param options.debug - Enable debug mode with verbose logging (default: true)
   * @param options.live - Enable production/live mode optimizations (default: false)
   * @param options.cwd - Working directory for the application (default: process.cwd())
   * @param options.config - Custom configuration controller class
   * @param options.plugins - Custom plugin loader class
   * @param options.logging - Custom logging controller class
   * @param options.metrics - Custom metrics controller class
   * @param options.events - Custom events controller class
   * @param options.services - Custom services controller class
   *
   * @example
   * ```typescript
   * // Basic usage with defaults
   * const app = new ServiceBase();
   * await app.init();
   * await app.run();
   * ```
   *
   * @example
   * ```typescript
   * // Production configuration
   * const app = new ServiceBase({
   *   debug: false,
   *   live: true,
   *   cwd: '/app'
   * });
   * await app.init();
   * await app.run();
   * ```
   *
   * @example
   * ```typescript
   * // Development configuration
   * const app = new ServiceBase({
   *   debug: true,
   *   live: false,
   *   cwd: process.cwd()
   * });
   * await app.init();
   * await app.run();
   * ```
   *
   * @see {@link ServiceBase.create} for factory method with simple options
   * @see {@link ServiceBase.fromPreset} for preset-based configuration
   * @see {@link ServiceBase.init} for initialization
   * @see {@link ServiceBase.run} for starting the application
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/ServiceBase.html | API: ServiceBase}
   */
  private readonly _region?: string;

  constructor(options: BSBOptions = {}) {
    const resolvedOptions = resolveBSBOptions(options);

    // Set instance properties from resolved options
    this.cwd = resolvedOptions.cwd;
    this.mode = resolvedOptions.mode;
    this._appId = resolvedOptions.appId;
    this._region = resolvedOptions.region;

    this._startKeep(BOOT_STAT_KEYS.SELF);

    // Initialize subsystems with resolved dependencies
    this.plugins = new resolvedOptions.plugins(this.cwd, this.mode === "development");
    this.observable = new resolvedOptions.observable(this._appId, this.mode, this.cwd, this.plugins);

    // Initialize unified observable backend BEFORE config and events
    this.observableBackend = new ObservableBackend(
      this.mode,
      this._appId,
      this._CORE_PLUGIN_NAME,
      this.observable,
    );

    // Create Observable factory for subsystems
    const createObservableFromTrace = (
      trace: DTrace,
      pluginName: string,
      attributes?: Record<string, string | number | boolean>
    ): Observable => {
      const resource = ResourceContextBuilder.build({
        appId: this._appId,
        mode: this.mode,
        pluginName: pluginName,
        cwd: this.cwd,
        packageCwd: this.cwd,
        pluginCwd: this.cwd,
        pluginVersion: "1.0.0"
      }, this._region);

      return new PluginObservable(
        trace,
        resource,
        this.observableBackend,
        attributes || {}
      );
    };

    this.events = new resolvedOptions.events(
      this._appId,
      this.mode,
      this.cwd,
      this.plugins,
      this.observable,
      createObservableFromTrace,
    );
    this.config = new resolvedOptions.config(
      this._appId,
      this.mode,
      this.cwd,
      this.observable,
      this.plugins,
      createObservableFromTrace,
    );

    this.observableBackend.info(internalTrace("CONSTRUCTOR"), "Starting BSB [{mode}]", {
      mode: this.mode,
    });
    this.services = new resolvedOptions.services(
      this._appId,
      this.mode,
      this.cwd,
      this.plugins,
      this.observable,
      this._region,
    );

    process.stdin.resume(); //so the program will not close instantly

    const self = this;

    //do something when app is closing
    process.on("exit", () => self.dispose(0, "app exit"));

    //catches ctrl+c event
    process.on("SIGINT", () => self.dispose(0, "manual exit"));

    // catches "kill pid" (for example: nodemon restart)
    process.on("SIGUSR1", () => self.dispose(1, "sig kill user 1"));
    process.on("SIGUSR2", () => self.dispose(2, "sig kill user 2"));

    //catches uncaught exceptions
    process.on("uncaughtException", (error: Error) => {
      self.observableBackend.error(internalTrace("UNCAUGHT_EXCEPTION"),
        "Uncaught exception: {error}\n Stack: {stack}",
        { error: error.message, stack: error.stack ?? 'no stack trace' }
      );
      self.dispose(3, "uncaught exception", error);
    });
    this._outputKeep(BOOT_STAT_KEYS.SELF);
  }

  /**
   * Initialize all subsystems and plugins
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/ServiceBase.html#init | API: ServiceBase.init}
   */
  public async init() {
    this._startKeep(BOOT_STAT_KEYS.INIT);

    this._startKeep(BOOT_STAT_KEYS.CONFIG);
    await this.config.init();
    this._outputKeep(BOOT_STAT_KEYS.CONFIG);
    this._startKeep(BOOT_STAT_KEYS.OBSERVABLE);
    await this.observable.init(internalTrace("OBSERVABLE_INIT"), this.config);
    this._outputKeep(BOOT_STAT_KEYS.OBSERVABLE);
    this._startKeep(BOOT_STAT_KEYS.EVENTS);
    await this.events.init(this.config, this.observable);
    this._outputKeep(BOOT_STAT_KEYS.EVENTS);
    // SERVICES ORDERING
    this._startKeep(BOOT_STAT_KEYS.SERVICES);
    await this.services.setup(this.config, this.observable, this.events);
    await this.services.init();
    this._outputKeep(BOOT_STAT_KEYS.SERVICES);

    this.coreMetrics = this.observableBackend;
    this.heartBeatMetric = this.coreMetrics.createCounter("heartbeat", "Heartbeat", "Heartbeat", [this._appId]);
    this.bsbBootTimeMetric = this.coreMetrics.createGauge("bsbBootTime", "BSB Boot Time", "BSB Boot Time", [this._appId]);

    this._outputKeep(BOOT_STAT_KEYS.INIT);
  }

  /**
   * Run the application after initialization
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/ServiceBase.html#run | API: ServiceBase.run}
   */
  public async run() {
    this._startKeep(BOOT_STAT_KEYS.RUN);
    await this.observable.run(internalTrace("OBSERVABLE_RUN"));
    await this.events.run();
    await this.services.run();
    this.observableBackend.info(internalTrace("RUN"), "Disposing config for memory cleanup and safety");
    this.config.dispose();
    this._outputKeep(BOOT_STAT_KEYS.RUN);

    this._heartbeat = setInterval(
      () => this.heartBeat(),
      60 * 60 * 1000,
    );
    this.heartBeat();
    this._outputKeep(BOOT_STAT_KEYS.BSB);
    this.bsbBootTimeMetric.set(this._keeps![BOOT_STAT_KEYS.BSB] as number);
    this._keeps = undefined;
  }

  private heartBeat() {
    this.observableBackend.debug(internalTrace("HEARTBEAT"), "Heartbeat");
    this.heartBeatMetric.increment();
  }

  private _disposing: boolean = false;

  /**
   * Dispose all subsystems and exit process with code
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/ServiceBase.html#dispose | API: ServiceBase.dispose}
   */
  async dispose(eCode: number = 0, reason: string, extraData?: any) {
    if (this._disposing) {
      return;
    }
    this._disposing = true;
    const trace = this.observableBackend.createTrace("dispose", { reason });
    const span = this.observableBackend.createSpan(trace.trace, "dispose", { reason });
    try {
      this.observableBackend.info(span.trace, "Disposing BSB: {reason}", { reason });
      if (extraData !== undefined) {
        this.observableBackend.error(span.trace, "Extra data: {data} {trace}", { data: extraData, trace: extraData.stack });
        console.error(extraData)
      }

      if (this._heartbeat !== undefined) {
        clearInterval(this._heartbeat);
      }

      if (this.services !== undefined) {
        this.observableBackend.debug(span.trace, "Disposing services");
        this.services.dispose();
      }
      if (this.events !== undefined) {
        this.observableBackend.debug(span.trace, "Disposing events");
        this.events.dispose();
      }
      if (this.observable !== undefined) {
        this.observableBackend.debug(span.trace, "Disposing observable");
        this.observable.dispose();
      }
      if (this.config !== undefined) {
        this.observableBackend.debug(span.trace, "Disposing config");
        this.config.dispose();
      }

      this._keeps = undefined;
    } catch (error) {
      span.error(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
      trace.end();
      console.log(`APP EXIT CODE ${ eCode } REASON ${ reason }`);
      process.exit(eCode);
    }
  }

  /**
   * Add a service plugin programmatically
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/ServiceBase.html#addService | API: ServiceBase.addService}
   */
  public async addService(
    name: string,
    plugin: typeof BSBService<any, any>,
    config: object | any,
  ) {
    if (this._keeps![BOOT_STAT_KEYS.SERVICES] !== undefined) {
      throw new BSBError(internalTrace("ADD_SERVICE"),
        "Cannot add service plugin as service already called"
      );
    }
    return await this.services.addPlugin(
      this.config,
      this.observable,
      this.events,
      {
        name,
        plugin: name,
        package: null,
        version: "0.0.0",
      },
      {
        serviceConfig: config,
        plugin: plugin as unknown as PluginTypeDefinitionRef<"service">,
        packageCwd: this.cwd,
        pluginCwd: this.cwd,
        pluginPath: "",
        version: "0.0.0",
        ref: name,
        name,
      },
      config,
    );
  }
}

export default ServiceBase;
