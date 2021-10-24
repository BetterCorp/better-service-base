import { Logger as DefaultLogger } from "./DefaultLogger";
import { CLogger, IPluginLogger } from "./ILib";
import { Plugins } from "./Plugins";

export default class ServiceBase {
  public readonly CORE_PLUGIN_NAME = "self";

  private _cwd: string;
  private _coreLogger: IPluginLogger;
  private _defaultLogger: CLogger;
  private _plugins: Plugins;

  private _heartbeat: NodeJS.Timer | null = null;

  private _keepTimerInitial: number = 0;
  private _keepTimer: number = 0;
  private _keepName: string = "";
  private _startKeep(stepName: string) {
    this._keepName = stepName;
    this._keepTimer = new Date().getTime();
    if (this._keepTimerInitial === 0)
      this._keepTimerInitial = this._keepTimer;
  }
  private _outputKeep() {
    this._coreLogger.info(`[TIMER] ${ this._keepName } took ${ (new Date().getTime()) - this._keepTimer }ms`);
  }
  private async _fatalHandler() {
    await this._coreLogger.error('CORE', 'APPLICATION FATAL ERROR OCCURED. PERFORMING APP EXIT (1)');
    if (this._heartbeat !== null)
      clearTimeout(this._heartbeat);
    process.exit(1);
  }
  constructor(cwd: string) {
    this._startKeep("boot");
    this._cwd = cwd;
    this._defaultLogger = new DefaultLogger('CORE', cwd, undefined!, {
      runningInDebug: true
    } as any);
    const self = this;
    this._coreLogger = {
      info: (...data: any[]): Promise<void> => self._defaultLogger.error(self.CORE_PLUGIN_NAME, ...data),
      warn: (...data: any[]): Promise<void> => self._defaultLogger.error(self.CORE_PLUGIN_NAME, ...data),
      error: (...data: any[]): Promise<void> => self._defaultLogger.error(self.CORE_PLUGIN_NAME, ...data),
      fatal: async (...data: any[]): Promise<void> => { await self._defaultLogger.error(self.CORE_PLUGIN_NAME, ...data); await self._fatalHandler(); },
      debug: (...data: any[]): Promise<void> => self._defaultLogger.error(self.CORE_PLUGIN_NAME, ...data),
    };
    this._coreLogger.info(":STARTUP");
    this._plugins = new Plugins(this._coreLogger, this._defaultLogger, this._cwd, this._fatalHandler);
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
    this._coreLogger.info(`[TIMER] FULL BOOT took ${ (new Date().getTime()) - this._keepTimerInitial }ms`);
  }
}