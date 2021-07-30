import { Logger as DefaultLogger } from './DefaultLogger';
import { CLogger, IPluginLogger } from "./ILib";
import { AppConfig } from './AppConfig';
import { Plugins } from './Plugins';

export default class ServiceBase {
  public readonly CORE_PLUGIN_NAME = 'self';

  private _cwd: string;
  private _appConfig: AppConfig;
  private _coreLogger: IPluginLogger;
  private _defaultLogger: CLogger;
  private _plugins: Plugins;

  constructor(cwd: string) {
    this._cwd = cwd;
    this._defaultLogger = new (DefaultLogger as any)(); // Default logger does not require any params, init or loaded to be called ...
    const self = this;
    this._coreLogger = {
      info: (...data: any[]): void => self._defaultLogger.error(self.CORE_PLUGIN_NAME, ...data),
      warn: (...data: any[]): void => self._defaultLogger.error(self.CORE_PLUGIN_NAME, ...data),
      error: (...data: any[]): void => self._defaultLogger.error(self.CORE_PLUGIN_NAME, ...data),
      fatal: (...data: any[]): void => self._defaultLogger.error(self.CORE_PLUGIN_NAME, ...data),
      debug: (...data: any[]): void => self._defaultLogger.error(self.CORE_PLUGIN_NAME, ...data),
    };
    this._coreLogger.info(':STARTUP');
    this._appConfig = new AppConfig(this._coreLogger, this._cwd);
    this._plugins = new Plugins(this._coreLogger, this._defaultLogger, this._appConfig, this._cwd);
    this._coreLogger.info(':STARTUP COMPLETED');
  }

  async init(): Promise<void> {
    this._coreLogger.info(':INIT CONSTRUCT');
    await this._plugins.constructAllPlugins();
    this._coreLogger.info(':INIT EVENTS');
    await this._plugins.setupEventsAllPlugins();
    this._coreLogger.info(':INIT PLUGINS INIT');
    await this._plugins.initAllPlugins();
    this._coreLogger.info(':INIT COMPLETED');
  }

  async run(): Promise<void> {
    this._coreLogger.info(':RUN PLUGINS LOAD');
    await this._plugins.loadAllPlugins();
    this._coreLogger.info(':RUN READY');

    const self = this;
    setInterval(() => {
      self._coreLogger.info('[HEARTBEAT]');
    }, 60 * 60 * 1000);
  }
}