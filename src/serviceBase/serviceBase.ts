import { IPluginLogger, LogMeta } from "../interfaces/logger";
import { SBLogger } from "./logger";
import { IPluginDefinition, IReadyPlugin } from "../interfaces/service";
import { SBPlugins } from "./plugins";
import { SBServices } from "./services";
import { IDictionary } from "@bettercorp/tools/lib/Interfaces";
import { SBConfig } from "./config";
import path from "path";
import fs from "fs";
import { SBEvents } from "./events";
import { randomUUID } from "crypto";
import { hostname } from "os";
import { Tools } from "@bettercorp/tools/lib/Tools";

export enum BOOT_STAT_KEYS {
  BSB = "BSB",
  SELF = "SELF",
  PLUGINS = "PLUGINS",
  CONFIG = "CONFIG",
  LOGGER = "LOGGER",
  EVENTS = "EVENTS",
  SERVICES = "SERVICES",
  INIT = "INIT",
  RUN = "RUN",
}

export const NS_PER_SEC = 1e9;
export const MS_PER_NS = 1e-6;
const TIMEKEEPLOG = "[TIMER] {timerName} took ({nsTime}ns) ({msTime}ms)";

export class ServiceBase {
  private _packJsonFile!: string;
  private _bsbPackJsonFile!: string;
  private _appVersion: string = "0.0.1-debug";
  private _bsbVersion: string = "0.0.1-debug";

  private _runningDebug: boolean = true;
  private _runningLive: boolean = false;

  private readonly _CORE_PLUGIN_NAME = "core";
  private readonly _appId;
  private _logger: SBLogger;
  private _config!: SBConfig;
  private _events!: SBEvents;
  private _services!: SBServices;

  private plugins: Array<IReadyPlugin> = [];
  private cwd!: string;
  private log!: IPluginLogger;

  private _keeps: IDictionary<[number, number]> = {};
  private _heartbeat!: NodeJS.Timer;
  private _startKeep(stepName: BOOT_STAT_KEYS) {
    if (this.log !== undefined)
      this.log.debug("Starting timer for {log}", { log: stepName });
    this._keeps[stepName] = process.hrtime();
  }
  private async _outputKeep(stepName: BOOT_STAT_KEYS) {
    let diff = process.hrtime(this._keeps[stepName] || undefined);
    let logMeta: LogMeta<typeof TIMEKEEPLOG> = {
      nsTime: diff[0] * NS_PER_SEC + diff[1],
      msTime: (diff[0] * NS_PER_SEC + diff[1]) * MS_PER_NS,
      timerName: stepName,
    };
    await this.log.info(TIMEKEEPLOG, logMeta);
    await this.log.reportStat(stepName, logMeta.nsTime as number);
  }
  constructor(debug: boolean = true, live: boolean = false, cwd: string) {
    this.cwd = cwd;
    this._runningDebug = debug;
    this._runningLive = live;
    this._appId = `${hostname()}-${randomUUID()}`;
    this._startKeep(BOOT_STAT_KEYS.BSB);
    // Initial boot will use the default logger which doesn't require anything special.
    // Once plugin search has been completed, then we can find the defined logger, or re-create the default logger with the correct config definition.
    this._logger = new SBLogger(
      this._appId,
      this._runningDebug,
      this._runningLive,
      this._CORE_PLUGIN_NAME
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
  }
  public async setupSelf() {
    this._startKeep(BOOT_STAT_KEYS.SELF);
    await this._logger.setupSelf();
    const self = this;
    await this._logger._loggerEvents.onEvent("d", "l", "fatal-e", async () =>
      self.dispose(4, "fatal event")
    );
    this.log = this._logger.generateLoggerForPlugin(this._CORE_PLUGIN_NAME);
    this._config = new SBConfig(this.log, this.cwd);
    this._events = new SBEvents(
      this._logger.generateLoggerForPlugin(this._CORE_PLUGIN_NAME + "-events")
    );
    this._services = new SBServices(
      this._logger.generateLoggerForPlugin(this._CORE_PLUGIN_NAME + "-services")
    );
    this.log.info("BOOT IN: {local}", { local: this.cwd });

    this._packJsonFile = path.join(this.cwd, "./package.json");
    if (!fs.existsSync(this._packJsonFile)) {
      this.log.fatal("PACKAGE.JSON FILE NOT FOUND IN {cwd}", { cwd: this.cwd });
      return;
    }
    this._appVersion = JSON.parse(
      fs.readFileSync(this._packJsonFile, "utf8").toString()
    ).version;

    this._bsbPackJsonFile = path.join(
      this.cwd,
      "./node_modules/@bettercorp/service-base/package.json"
    );
    if (fs.existsSync(this._bsbPackJsonFile)) {
      this._bsbVersion = JSON.parse(
        fs.readFileSync(this._bsbPackJsonFile, "utf8").toString()
      ).version;
    }

    this.log.info(
      `BOOT UP: @{version} with BSB@{BSBVersion} and debugging {debugMode} while running {runningLive}`,
      {
        version: this._appVersion,
        BSBVersion: this._bsbVersion,
        debugMode: this._runningDebug,
        runningLive: this._runningLive,
      }
    );
    this._outputKeep(BOOT_STAT_KEYS.SELF);
  }

  public async setupPlugins(cwd: string, CLIONLY = false): Promise<void> {
    this._startKeep(BOOT_STAT_KEYS.PLUGINS);
    this.log.info("INIT PLUGIN LOCATOR");
    let dirsToSearch: Array<string> = [this.cwd];
    this.plugins = [];
    if (
      process.env.BSB_CONTAINER == "true" &&
      `${process.env.BSB_PLUGIN_DIR || ""}` !== ""
    ) {
      await this.log.info(
        "NOTE: RUNNING IN BSB CONTAINER - PLUGIN LOCATION ALTERED"
      );
      dirsToSearch = dirsToSearch.concat(
        (process.env.BSB_PLUGIN_DIR || "").split(",")
      );
    }
    if (dirsToSearch.length > 0) {
      await this.log.info("Find all plugins: {dirs}", {
        dirs: dirsToSearch,
      });

      for (let dir of dirsToSearch) {
        await this.log.info("Find plugins: {dir}", { dir });
        this.plugins = this.plugins.concat(
          await SBPlugins.findNPMPlugins(this.log, dir)
        );
      }
    }
    await this.log.info(`Performing a node_modules local search.`);
    this.plugins = this.plugins.concat(
      await SBPlugins.findLocalPlugins(this.log, cwd, CLIONLY)
    );

    await this.log.info(`{len} plugins found`, {
      len: this.plugins.length,
    });

    this._outputKeep(BOOT_STAT_KEYS.PLUGINS);
    this.cwd = cwd;
  }

  public async setupConfig() {
    this._startKeep(BOOT_STAT_KEYS.CONFIG);
    await this._config.findConfigPlugin(this.plugins);
    let configPluginName = this._config.getPluginName();
    await this._config.setupConfigPlugin(
      this._logger.generateLoggerForPlugin(configPluginName),
      this._appId,
      this._runningDebug,
      this._runningLive,
      this.plugins
    );
    this.plugins = await this._config.mapPlugins(this.plugins);
    this._outputKeep(BOOT_STAT_KEYS.CONFIG);
  }
  public async setupLogger() {
    this._startKeep(BOOT_STAT_KEYS.LOGGER);
    let loggingPlugin = await this._config.findPluginByType(
      this.plugins,
      "log-default",
      IPluginDefinition.logging
    );
    await this._config.ImportAndMigratePluginConfig(loggingPlugin);
    await this._logger.setupLogger(
      this._appId,
      this._runningDebug,
      this._runningLive,
      this.cwd,
      this._config.appConfig,
      loggingPlugin
    );
    this._outputKeep(BOOT_STAT_KEYS.LOGGER);
  }
  public async setupEvents() {
    this._startKeep(BOOT_STAT_KEYS.EVENTS);
    let eventsPlugin = await this._config.findPluginByType(
      this.plugins,
      "events-default",
      IPluginDefinition.events
    );
    await this._config.ImportAndMigratePluginConfig(eventsPlugin);
    await this._events.setupEvents(
      this._appId,
      this._runningDebug,
      this._runningLive,
      this.cwd,
      this._config.appConfig,
      eventsPlugin,
      this._logger.generateLoggerForPlugin(eventsPlugin.mappedName)
    );
    this._outputKeep(BOOT_STAT_KEYS.EVENTS);
  }
  public async setupServices() {
    this._startKeep(BOOT_STAT_KEYS.SERVICES);
    const self = this;
    await this._services.setupServicePlugins(
      this._appId,
      this._runningDebug,
      this._runningLive,
      this.cwd,
      this.plugins,
      this._config.appConfig,
      (a) => self._config.ImportAndMigratePluginConfig(a),
      (a, b) => self._events.generateEventsForService(a, b),
      (a) => self._logger.generateLoggerForPlugin(a)
    );
    this._outputKeep(BOOT_STAT_KEYS.SERVICES);
  }

  public async initPlugins() {
    this._startKeep(BOOT_STAT_KEYS.INIT);
    await this._services.servicesInit();
    this._outputKeep(BOOT_STAT_KEYS.INIT);
  }

  public async runPlugins() {
    this._startKeep(BOOT_STAT_KEYS.RUN);
    await this._services.servicesRun();
    this._outputKeep(BOOT_STAT_KEYS.RUN);
  }

  private async heartBeat() {
    await this.log.debug("[HEARTBEAT] ({appId}) ({time})", {
      appId: this._appId,
      time: new Date().toISOString(),
    });
  }
  async run() {
    const self = this;
    this._heartbeat = setInterval(
      async () => await self.heartBeat(),
      60 * 60 * 1000
    );
    await self.heartBeat();
    this._outputKeep(BOOT_STAT_KEYS.BSB);
  }
  private _disposing: boolean = false;
  async dispose(eCode: number = 0, reason: string, extraData?: any) {
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
      if (!Tools.isNullOrUndefined(extraData)) await this.log.error(extraData);
    }
    clearInterval(this._heartbeat);
    try {
      await this.log.warn("Disposing services");
      this._services.dispose();
      await this.log.warn("Disposing events");
      this._events.dispose();
      await this.log.warn("Disposing config");
      this._config.dispose();
      await this.log.warn("Disposing logger");
      this._logger.dispose();
    } catch (exc) {
      console.error(exc);
      console.error("Disposing forcefully!");
    }

    console.warn("BSB Disposed successfully. exiting code " + eCode);
    process.exit(eCode);
  }
}
export default ServiceBase;
