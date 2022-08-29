import { IPluginLogger } from "../interfaces/logger";
//import { LoggerBase } from "../logger/logger";
//import { PluginBase } from "../plugin/plugin";
import { SBLogger } from "./logger";
import { IReadyPlugin } from "../interfaces/plugin";
//import { IDictionary } from "@bettercorp/tools/lib/Interfaces";
//import { IConfig } from "../interfaces/config";
import { SBFinder } from "./finder";
import { IDictionary } from "@bettercorp/tools/lib/Interfaces";
import { SBConfig } from "./config";

export class ServiceBase {
  public readonly CORE_PLUGIN_NAME = "core";
  private _coreLogger!: IPluginLogger;
  private _logger: SBLogger;
  private _config!: SBConfig;
  private cwd!: string;
  //private _appConfig!: IConfig;
  //private _loadedPlugins: IDictionary<PluginBase> = {};
  private _plugins: Array<IReadyPlugin> = [];
  //private _logger: LoggerBase;
  //private _loggerName = "log";
  //private _events: EventsBase;
  //private _eventsName = "events";

  //private _heartbeat: NodeJS.Timer | null = null;

  private _keeps: IDictionary<number> = {};
  //private _keepTimerInitial = 0;
  //private _keepTimer = 0;
  //private _keepName: string = "";
  private _startKeep(stepName: string) {
    if (this._coreLogger !== undefined)
      this._coreLogger.debug("Starting timer for {log}", { log: stepName });
    this._keeps[stepName] = this.timeNow();
    //this._keepName = stepName;
    //this._keepTimer = new Date().getTime();
    //if (this._keepTimerInitial === 0) this._keepTimerInitial = this._keepTimer;
  }
  private timeNow() {
    let hrTime = process.hrtime();
    return hrTime[0] * 1000000 + hrTime[1] / 1000;
  }
  private async _outputKeep(stepName: string) {
    let timr = this.timeNow() - (this._keeps[stepName] || 0);
    await this._coreLogger.info(`[TIMER] {timerName} took {time}ns`, {
      time: timr,
      timerName: stepName,
    });
    await this._coreLogger.reportStat(stepName, timr);
  }
  constructor(debug: boolean = false) {
    this._startKeep("bsb");
    // Initial boot will use the default logger which doesn't require anything special.
    // Once plugin search has been completed, then we can find the defined logger, or re-create the default logger with the correct config definition.

    this._logger = new SBLogger(this.CORE_PLUGIN_NAME, debug);
    /*this._logger.setupLogger("./", {
      runningDebug: debug,
      runningLive: false,
    } as any);*/
  }
  public async setupSelf() {
    this._startKeep("boot");
    await this._logger.setupSelf();
    this._coreLogger = this._logger.generateLoggerForPlugin(
      this.CORE_PLUGIN_NAME
    );
    this._config = new SBConfig(
      this._logger.generateLoggerForPlugin(this.CORE_PLUGIN_NAME + "-config")
    );
    this._coreLogger.info("STARTUP");
    this._outputKeep("boot");
  }

  public async findPlugins(cwd: string): Promise<void> {
    this._startKeep("findPlugins");
    this._coreLogger.info("INIT PLUGIN LOCATOR");
    let dirsToSearch: Array<string> = [];
    this._plugins = [];
    if (
      process.env.BSB_CONTAINER == "true" &&
      `${process.env.BSB_PLUGIN_DIR || ""}` !== ""
    ) {
      await this._coreLogger.info(
        "NOTE: RUNNING IN BSB CONTAINER - PLUGIN LOCATION ALTERED"
      );
      dirsToSearch = dirsToSearch.concat(
        (process.env.BSB_PLUGIN_DIR || "").split(",")
      );
    }
    //console.log('fap', dirsToSearch)
    await this._coreLogger.info("FIND: find all plugins: {dirs}", {
      dirs: dirsToSearch,
    });

    for (let dir of dirsToSearch) {
      await this._coreLogger.info("FIND: find plugins: {dir}", { dir });
      this._plugins = this._plugins.concat(
        await SBFinder.findNPMPlugins(this._coreLogger, dir)
      );
    }
    await this._coreLogger.info(
      `FIND: Performing a node_modules local search.`
    );
    this._plugins = this._plugins.concat(
      await SBFinder.findLocalPlugins(this._coreLogger, cwd)
    );

    await this._coreLogger.info(`FIND: {len} plugins found`, {
      len: this._plugins.length,
    });

    this._outputKeep("findPlugins");
    this.cwd = cwd;
  }
  public async setupConfig() {
    this._startKeep("config");
    await this._config.findConfigPlugin(this._plugins, this.cwd);
    let configPluginName = this._config.getPluginName();
    await this._config.setupConfigPlugin(
      this._logger.generateLoggerForPlugin(configPluginName)
    );
    this._outputKeep("config");
  }
  public async setupLogger() {
    return;
    /*this._startKeep("logger");
    await this._logger.setupSelf();
    this._coreLogger = this._logger.generateLoggerForPlugin(
      this.CORE_PLUGIN_NAME
    );
    this._outputKeep("logger");*/
  }

  /*
  async config(): Promise<void> {
    this._startKeep("config");
    this._coreLogger.info(":INIT CONFIG PLUGIN");
    await this._plugins.setupConfigPlugin();
    this._coreLogger.info(":INIT CONFIG");
    await this._plugins.configAllPlugins();
    this._outputKeep();
  }

  async construct(): Promise<void> {
    this._startKeep("construct");
    this._coreLogger.info(":INIT CONSTRUCT");
    await this._plugins.constructAllPlugins();
    this._outputKeep();
  }

  async init(): Promise<void> {
    this._startKeep("init");
    this._coreLogger.info(":INIT EVENTS");
    await this._plugins.setupEventsAllPlugins();
    this._coreLogger.info(":INIT PLUGINS LOGGER/EVENTS");
    await this._plugins.initCorePlugins();
    this._coreLogger.info(":INIT PLUGINS INIT");
    await this._plugins.initAllPlugins();
    this._coreLogger.info(":INIT COMPLETED");
    this._outputKeep();
  }

  async run(): Promise<void> {
    this._startKeep("run");
    this._coreLogger.info(":RUN PLUGINS LOAD");
    await this._plugins.loadAllPlugins();
    this._coreLogger.info(":RUN READY");

    const self = this;
    this._heartbeat = setInterval(() => {
      self._coreLogger.info("[HEARTBEAT]");
    }, 60 * 60 * 1000);

    this._outputKeep();
    this._coreLogger.info(`[TIMER] FULL BOOT took {time}ms`, {
      time: new Date().getTime() - this._keepTimerInitial,
    });
  }*/

  async run() {
    this._outputKeep("bsb");
  }
}
export default ServiceBase;
