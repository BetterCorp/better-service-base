import { IPluginLogger, LogMeta } from "./interfaces/logger";
import { Logger } from "./logger/logger";
import { Plugins } from "./plugins/plugins";

export default class ServiceBase {
  public readonly CORE_PLUGIN_NAME = "self";

  private _cwd: string;
  private _coreLogger: IPluginLogger;
  private _plugins: Plugins;

  private _heartbeat: NodeJS.Timer | null = null;

  private _keepTimerInitial = 0;
  private _keepTimer = 0;
  private _keepName = "";
  private _startKeep(stepName: string) {
    this._keepName = stepName;
    this._keepTimer = new Date().getTime();
    if (this._keepTimerInitial === 0) this._keepTimerInitial = this._keepTimer;
  }
  private _outputKeep() {
    this._coreLogger.info(`[TIMER] {timerName} took {time}ms`, {
      time: new Date().getTime() - this._keepTimer,
      timerName: this._keepName
    });
  }
  private async _fatalHandler() {
    await this._coreLogger.error(
      "APPLICATION FATAL ERROR OCCURED. PERFORMING APP EXIT (1)"
    );
    if (this._heartbeat !== null) clearInterval(this._heartbeat);
    process.exit(1);
  }
  constructor(cwd: string) {
    this._startKeep("boot");
    this._cwd = cwd;
    let logger = new Logger("CORE", cwd, undefined!, {
      runningInDebug: process.env.DEBUG === "true",
      runningLive: process.env.LIVE === "true",
    } as any);
    this._coreLogger = {
      info: async (
        message: string,
        meta?: LogMeta,
        hasPIData?: boolean
      ): Promise<void> =>
        await logger.info(this.CORE_PLUGIN_NAME, message, meta, hasPIData),
      warn: async (
        message: string,
        meta?: LogMeta,
        hasPIData?: boolean
      ): Promise<void> =>
        await logger.warn(this.CORE_PLUGIN_NAME, message, meta, hasPIData),
      error: async (
        message: string,
        meta?: LogMeta,
        hasPIData?: boolean
      ): Promise<void> =>
        await logger.error(this.CORE_PLUGIN_NAME, message, meta, hasPIData),
      fatal: async (
        message: string,
        meta?: LogMeta,
        hasPIData?: boolean
      ): Promise<void> =>
        await logger.fatal(this.CORE_PLUGIN_NAME, message, meta, hasPIData),
      debug: async (
        message: string,
        meta?: LogMeta,
        hasPIData?: boolean
      ): Promise<void> =>
        await logger.debug(this.CORE_PLUGIN_NAME, message, meta, hasPIData),
    };

    this._coreLogger.info(":STARTUP");
    this._plugins = new Plugins(
      this._coreLogger,
      this._cwd,
      this._fatalHandler
    );
    this._coreLogger.info(":STARTUP COMPLETED");
    this._outputKeep();
  }

  private async findAllPlugins(): Promise<void> {
    this._startKeep("findAllPlugins");
    this._coreLogger.info(":INIT PLUGIN LOCATOR");
    await this._plugins.findAllPlugins();
    this._outputKeep();
  }

  async config(): Promise<void> {
    await this.findAllPlugins();
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
  }
}
