/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2024 BetterCorp (PTY) Ltd  
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

import {v7 as randomUUID} from "uuid";
import {hostname} from "node:os";
import {
  BSBConfig,
  BSBError,
  BSBEvents, BSBLogging, BSBMetrics,
  BSBService, MS_PER_NS, NS_PER_SEC,
  PluginLogger,
  SmartFunctionCallSync,
  Tools,
} from "../base";
import {DEBUG_MODE, IPluginLogger, LogMeta, PluginTypeDefinitionRef} from "../interfaces";
import {SBConfig} from "./config";
import {SBEvents} from "./events";
import {SBLogging} from "./logging";
import {SBMetrics} from "./metrics";
import {SBPlugins} from "./plugins";
import {SBServices} from "./services";

/**
 * @hidden
 */
export const BOOT_STAT_KEYS = {
  BSB: "BSB",
  SELF: "SELF",
  CONFIG: "CONFIG",
  LOGGING: "LOGGER",
  METRICS: "METRICS",
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

export class ServiceBase {
  private readonly mode: DEBUG_MODE = "development";

  private readonly _CORE_PLUGIN_NAME = "core";
  private readonly _appId;
  private readonly logging: SBLogging;
  private readonly metrics: SBMetrics;
  private readonly plugins: SBPlugins;
  private readonly config: SBConfig;
  private readonly events: SBEvents;
  private readonly log: IPluginLogger;
  //private readonly metric: IPluginMetrics;
  private readonly services!: SBServices;
  private readonly cwd!: string;

  private _keeps?: Record<BootStatKeys, [number, number] | number> = {
    BSB: process.hrtime(),
  } as any;
  private _heartbeat!: ReturnType<typeof setInterval>;

  private _startKeep(stepName: BootStatKeys) {
    if (this._keeps === undefined) {
      throw new BSBError("Internal error with timekeeper!");
    }
    if (this.log !== undefined) {
      this.log.debug("Starting timer for {log}", {log: stepName});
    }
    this._keeps[stepName] = process.hrtime();
  }

  private _outputKeep(stepName: BootStatKeys) {
    if (this._keeps === undefined) {
      throw new BSBError("Internal error with timekeeper!");
    }
    if (typeof this._keeps[stepName] === "number") {
      throw new BSBError("Internal error with timekeeper!");
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
    this.log.info(TIMEKEEPLOG, logMeta);
  }

  constructor(
      debug: boolean = true, // Enable debug logging (true): disabled debug logging
      live: boolean = false, // Disable development mode (true): changes the way plugins are imported
      cwd: string, // Current working directory: The current directory where you are running from
      config: typeof SBConfig = SBConfig, // Config handler: Allows you to override default behavour,
      plugins: typeof SBPlugins = SBPlugins, // Plugins handler: Allows you to override default behavour,
      logging: typeof SBLogging = SBLogging, // Logging handler: Allows you to override default behavour,
      metrics: typeof SBMetrics = SBMetrics, // Metrics handler: Allows you to override default behavour,
      events: typeof SBEvents = SBEvents, // Events handler: Allows you to override default behavour,
      services: typeof SBServices = SBServices, // Services handler: Allows you to override default behavour
  ) {
    this.cwd = cwd;
    if (live === false) {
      this.mode = "development";
    } else if (debug === true) {
      this.mode = "production-debug";
    } else {
      this.mode = "production";
    }

    this._appId = `${hostname()}-${randomUUID()}`;
    if (typeof process.env.BSB_APP_ID === "string" && process.env.BSB_APP_ID.length > 2) {
      this._appId = process.env.BSB_APP_ID;
    }

    this._startKeep(BOOT_STAT_KEYS.SELF);

    this.plugins = new plugins(this.cwd, this.mode === "development");
    this.logging = new logging(this._appId, this.mode, this.cwd, this.plugins);
    this.metrics = new metrics(this._appId, this.mode, this.cwd, this.plugins, this.logging);
    this.events = new events(
        this._appId,
        this.mode,
        this.cwd,
        this.plugins,
        this.logging,
        this.metrics,
    );
    this.config = new config(
        this._appId,
        this.mode,
        this.cwd,
        this.logging,
        this.plugins,
    );

    this.log = new PluginLogger(
        this.mode,
        this._CORE_PLUGIN_NAME,
        this.logging,
    );
    /*this.metric = new PluginMetrics(
        this._CORE_PLUGIN_NAME,
        this.metrics,
    );*/
    this.log.info("Starting BSB [{mode}]", {
      mode: this.mode,
    });
    this.services = new services(
        this._appId,
        this.mode,
        this.cwd,
        this.plugins,
        this.logging,
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
    process.on("uncaughtException", (e) =>
        self.dispose(3, "uncaught exception", e),
    );
    this._outputKeep(BOOT_STAT_KEYS.SELF);
  }

  public async init() {
    this._startKeep(BOOT_STAT_KEYS.INIT);

    this._startKeep(BOOT_STAT_KEYS.CONFIG);
    await this.config.init();
    this._outputKeep(BOOT_STAT_KEYS.CONFIG);
    this._startKeep(BOOT_STAT_KEYS.LOGGING);
    await this.logging.init(this.config);
    this._outputKeep(BOOT_STAT_KEYS.LOGGING);
    this._startKeep(BOOT_STAT_KEYS.METRICS);
    await this.metrics.init(this.config);
    this._outputKeep(BOOT_STAT_KEYS.METRICS);
    this._startKeep(BOOT_STAT_KEYS.EVENTS);
    await this.events.init(this.config, this.logging);
    this._outputKeep(BOOT_STAT_KEYS.EVENTS);
    // SERVICES ORDERING
    this._startKeep(BOOT_STAT_KEYS.SERVICES);
    await this.services.setup(this.config, this.logging, this.events, this.metrics);
    await this.services.init();
    this._outputKeep(BOOT_STAT_KEYS.SERVICES);

    this._outputKeep(BOOT_STAT_KEYS.INIT);
  }

  public async run() {
    this._startKeep(BOOT_STAT_KEYS.RUN);
    await this.logging.run();
    await this.events.run();
    await this.services.run();
    this.log.info("Disposing config for memory cleanup and safety");
    this.config.dispose();
    this._outputKeep(BOOT_STAT_KEYS.RUN);

    this._heartbeat = setInterval(
        async () => await this.heartBeat(),
        60 * 60 * 1000,
    );
    await this.heartBeat();
    this._outputKeep(BOOT_STAT_KEYS.BSB);

    if (this._keeps === undefined) {
      throw new BSBError("Internal error with timekeeper!");
    }
    /*for (const bootKey of Object.keys(this._keeps) as Array<BootStatKeys>) {
      if (typeof this._keeps[bootKey] !== "number") {
        throw new BSBError("Internal error with timekeeper!");
      }
      this.metric.createGauge(bootKey)
          .set((
              this._keeps[bootKey] as number
          ), {appId: this._appId});
    }*/
    delete this._keeps;
  }

  private async heartBeat() {
    this.log.debug("[HEARTBEAT] ({appId}) ({time})", {
      appId: this._appId,
      time: new Date().toISOString(),
    });
  }

  private _disposing: boolean = false;

  async dispose(eCode: number = 0, reason: string, extraData?: any) {
    console.error(reason, extraData);
    if (this._disposing) {
      return;
    }
    this._disposing = true;

    if (eCode === 0) {
      this.log.warn(
          "Disposing service: {appId} code {eCode} ({reason}): {extraMsg}",
          {
            appId: this._appId,
            eCode,
            reason,
            extraMsg: Tools.isNullOrUndefined(extraData)
                ? ""
                : extraData.toString(),
          },
      );
    } else {
      this.log.error(
          "Disposing service: {appId} code {eCode} ({reason})",
          {
            appId: this._appId,
            eCode,
            reason,
          },
      );
      //if (!Tools.isNullOrUndefined(extraData)) this.log.error(extraData);
    }
    clearInterval(this._heartbeat);
    try {
      this.log.warn("Disposing services");
      SmartFunctionCallSync(this.services, this.services.dispose);
      this.log.warn("Disposing events");
      SmartFunctionCallSync(this.events, this.events.dispose);
      this.log.warn("Disposing config");
      SmartFunctionCallSync(this.config, this.config.dispose);
      this.log.warn("Disposing metrics");
      SmartFunctionCallSync(this.metrics, this.metrics.dispose);
      this.log.warn("Disposing logger");
      SmartFunctionCallSync(this.logging, this.logging.dispose);
    } catch (exc) {
      console.error(exc);
      console.error("Disposing forcefully!");
    }

    console.warn("BSB Disposed successfully. exiting code " + eCode);
    process.exit(eCode);
  }

  public async setConfigPlugin(name: string, reference: typeof BSBConfig) {
    if (this._keeps![BOOT_STAT_KEYS.CONFIG] !== undefined) {
      throw new BSBError(
          "Cannot add config plugin as config already initialized",
      );
    }
    return this.config.setConfigPlugin({
      serviceConfig: null,
      plugin: reference as unknown as PluginTypeDefinitionRef<"config">,
      packageCwd: this.cwd,
      pluginCwd: this.cwd,
      pluginPath: "",
      version: "0.0.0",
      ref: name,
      name,
    });
  }

  public async addService(
      name: string,
      plugin: typeof BSBService<any, any>,
      config: object | any,
  ) {
    if (this._keeps![BOOT_STAT_KEYS.SERVICES] !== undefined) {
      throw new BSBError(
          "Cannot add service plugin as service already called",
      );
    }
    return await this.services.addPlugin(
        this.config,
        this.logging,
        this.events,
        this.metrics,
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

  public async addEventsX(
      name: string,
      plugin: typeof BSBEvents<any>,
      config: object | any,
  ) {
    if (this._keeps![BOOT_STAT_KEYS.EVENTS] !== undefined) {
      throw new BSBError(
          "Cannot add events plugin as events already initialized",
      );
    }
    return await this.events.addPlugin(
        this.logging,
        {
          name,
          plugin: name,
          package: null,
          version: "0.0.0",
        },
        {
          serviceConfig: config,
          plugin: plugin as unknown as PluginTypeDefinitionRef<"events">,
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

  public async addLogging(
      name: string,
      plugin: typeof BSBLogging<any>,
      config: object | any,
  ) {
    if (this._keeps![BOOT_STAT_KEYS.LOGGING] !== undefined) {
      throw new BSBError(
          "Cannot add logging plugin as logging already initialized",
      );
    }
    return await this.logging.addPlugin(
        {
          name,
          plugin: name,
          package: null,
          version: "0.0.0",
        },
        {
          serviceConfig: config,
          plugin: plugin as unknown as PluginTypeDefinitionRef<"logging">,
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

  public async addMetrics(
      name: string,
      plugin: typeof BSBMetrics<any>,
      config: object | any,
  ) {
    if (this._keeps![BOOT_STAT_KEYS.METRICS] !== undefined) {
      throw new BSBError(
          "Cannot add metrics plugin as metrics already initialized",
      );
    }
    return await this.metrics.addPlugin(
        {
          name,
          plugin: name,
          package: null,
          version: "0.0.0",
        },
        {
          serviceConfig: config,
          plugin: plugin as unknown as PluginTypeDefinitionRef<"metrics">,
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
