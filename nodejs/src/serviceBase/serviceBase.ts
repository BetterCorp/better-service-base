import { DEBUG_MODE, IPluginLogger, LogMeta } from "../interfaces/logging";
import { SBLogging } from "./logging";
import { SBPlugins } from "./plugins";
import { SBServices } from "./services";
import { IDictionary } from "@bettercorp/tools/lib/Interfaces";
import { SBConfig } from "./config";
//import { SBEvents } from "./events";
import { randomUUID } from "crypto";
import { hostname } from "os";
import { Tools } from "@bettercorp/tools/lib/Tools";
import { PluginLogger } from "../base/PluginLogger";
import { SmartFunctionCallSync } from "../base/functions";
import { SBEvents } from "./events";

export const BOOT_STAT_KEYS = {
  BSB: "BSB",
  SELF: "SELF",
  PLUGINS: "PLUGINS",
  CONFIG: "CONFIG",
  LOGGER: "LOGGER",
  EVENTS: "EVENTS",
  SERVICES: "SERVICES",
  INIT: "INIT",
  RUN: "RUN",
} as const;
export type BootStatKeys = (typeof BOOT_STAT_KEYS)[keyof typeof BOOT_STAT_KEYS];

export const NS_PER_SEC = 1e9;
export const MS_PER_NS = 1e-6;
const TIMEKEEPLOG = "[TIMER] {timerName} took ({nsTime}ns) ({msTime}ms)";

export class ServiceBase {
  /*private _packJsonFile!: string;
  private _bsbPackJsonFile!: string;
  private _appVersion: string = "0.0.1-debug";
  private _bsbVersion: string = "0.0.1-debug";*/

  private mode: DEBUG_MODE = "development";

  private readonly _CORE_PLUGIN_NAME = "core";
  private readonly _appId;
  private logging: SBLogging;
  private plugins: SBPlugins;
  private config: SBConfig;
  private events: SBEvents;
  private log: IPluginLogger;
  private services!: SBServices;
  private cwd!: string;

  private _keeps: IDictionary<[number, number]> = {
    BSB: process.hrtime(),
  };
  private _heartbeat!: ReturnType<typeof setInterval>;
  private _startKeep(stepName: BootStatKeys) {
    if (this.log !== undefined)
      this.log.debug("Starting timer for {log}", { log: stepName });
    this._keeps[stepName] = process.hrtime();
  }
  private async _outputKeep(stepName: BootStatKeys) {
    let diff = process.hrtime(this._keeps[stepName] || undefined);
    let logMeta: LogMeta<typeof TIMEKEEPLOG> = {
      nsTime: diff[0] * NS_PER_SEC + diff[1],
      msTime: (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS,
      timerName: stepName,
    };
    await this.log.info(TIMEKEEPLOG, logMeta);
    await this.log.reportStat(stepName, logMeta.nsTime as number);
  }
  constructor(
    debug: boolean = true, // Enable debug logging (true): disabled debug logging
    live: boolean = false, // Disable development mode (true): changes the way plugins are imported
    cwd: string, // Current working directory: The current directory where you are running from
    config: typeof SBConfig = SBConfig, // Config handler: Allows you to override default behavour,
    plugins: typeof SBPlugins = SBPlugins, // Plugins handler: Allows you to override default behavour,
    logging: typeof SBLogging = SBLogging, // Logging handler: Allows you to override default behavour,
    events: typeof SBEvents = SBEvents, // Events handler: Allows you to override default behavour,
    services: typeof SBServices = SBServices // Services handler: Allows you to override default behavour
  ) {
    this._startKeep(BOOT_STAT_KEYS.SELF);
    this.cwd = cwd;
    if (live === false) this.mode = "development";
    else if (debug === true) this.mode = "production-debug";
    else this.mode = "production";

    this._appId = `${hostname()}-${randomUUID()}`;

    this.plugins = new plugins(this.cwd, this.mode === "development");
    this.logging = new logging(this._appId, this.mode, this.cwd, this.plugins);
    this.events = new events(
      this._appId,
      this.mode,
      this.cwd,
      this.plugins,
      this.logging
    );
    this.config = new config(
      this._appId,
      this.mode,
      this.cwd,
      this.logging,
      this.plugins
    );
    
    this.log = new PluginLogger(
      this.mode,
      this._CORE_PLUGIN_NAME,
      this.logging
    );
    this.log.info("Starting BSB");
    this.services = new services(
      this._appId,
      this.mode,
      this.cwd,
      this.plugins,
      this.logging
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
      self.dispose(3, "uncaught exception", e)
    );
    this._outputKeep(BOOT_STAT_KEYS.SELF);
  }

  public async init() {
    this._startKeep(BOOT_STAT_KEYS.CONFIG);
    await this.config.init();
    this._outputKeep(BOOT_STAT_KEYS.CONFIG);
    this._startKeep(BOOT_STAT_KEYS.LOGGER);
    await this.logging.init(this.config);
    this._outputKeep(BOOT_STAT_KEYS.LOGGER);
    this._startKeep(BOOT_STAT_KEYS.EVENTS);
    await this.events.init(this.config, this.logging);
    this._outputKeep(BOOT_STAT_KEYS.EVENTS);
    // SERVICES ORDERING
    this._startKeep(BOOT_STAT_KEYS.SERVICES);
    await this.services.setup(this.config, this.logging, this.events);
    this._outputKeep(BOOT_STAT_KEYS.SERVICES);

    this._startKeep(BOOT_STAT_KEYS.INIT);
    await this.services.init(this.config);
    this._outputKeep(BOOT_STAT_KEYS.INIT);
  }

  public async run() {
    this._startKeep(BOOT_STAT_KEYS.RUN);
    await this.logging.run();
    await this.events.run();
    await this.services.run(this.config);
    this.log.info("Disposing config for memory cleanup and safety");
    this.config.dispose();
    this._outputKeep(BOOT_STAT_KEYS.RUN);

    this._heartbeat = setInterval(
      async () => await this.heartBeat(),
      60 * 60 * 1000
    );
    await this.heartBeat();
    this._outputKeep(BOOT_STAT_KEYS.BSB);
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
    if (this._disposing) return;
    this._disposing = true;

    if (eCode === 0)
      await this.log.warn(
        "Disposing service: {appId} code {eCode} ({reason}): {extraMsg}",
        {
          appId: this._appId,
          eCode,
          reason,
          extraMsg: Tools.isNullOrUndefined(extraData)
            ? ""
            : extraData.toString(),
        }
      );
    else {
      await this.log.error(
        "Disposing service: {appId} code {eCode} ({reason})",
        {
          appId: this._appId,
          eCode,
          reason,
        }
      );
      //if (!Tools.isNullOrUndefined(extraData)) this.log.error(extraData);
    }
    clearInterval(this._heartbeat);
    try {
      await this.log.warn("Disposing services");
      SmartFunctionCallSync(this.services, this.services.dispose);
      await this.log.warn("Disposing events");
      //this.events.dispose();
      await this.log.warn("Disposing config");
      //SmartFunctionCall(this.config.dispose);
      await this.log.warn("Disposing logger");
      //SmartFunctionCall(this.logging.dispose);
    } catch (exc) {
      console.error(exc);
      console.error("Disposing forcefully!");
    }

    console.warn("BSB Disposed successfully. exiting code " + eCode);
    process.exit(eCode);
  }
}
export default ServiceBase;
