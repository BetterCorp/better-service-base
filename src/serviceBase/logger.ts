import { LoggerBase } from "../logger/logger";
import { IPluginLogger } from "../interfaces/logger";
import { Logger as DefaultLogger } from "../plugins/log-default/plugin";
import { SBBase } from "./base";
import { ConfigBase } from "../config/config";
import { Events as DefaultEvents } from "../plugins/events-default/plugin";
import { IReadyPlugin } from "../interfaces/service";

export class SBLogger {
  private log: IPluginLogger;
  private _logger: DefaultLogger;
  public _loggerEvents: DefaultEvents;
  private _activeLogger: LoggerBase | undefined;
  constructor(
    appId: string,
    runningDebug: boolean,
    runningLive: boolean,
    CORE_PLUGIN_NAME: string
  ) {
    this._logger = new DefaultLogger("default-logger", "./", undefined!);
    SBBase.setupPlugin(
      appId,
      runningDebug,
      runningLive,
      this._logger,
      {} as any
    );
    this._loggerEvents = new DefaultEvents(
      "default-logger-events",
      "./",
      this.generateNullLoggerForPlugin()
    );
    this.log = this.generateLoggerForPlugin(`${CORE_PLUGIN_NAME}-logger`);
  }

  public dispose() {
    if (this._activeLogger !== undefined) this._activeLogger.dispose();
    this._logger.dispose();
  }

  public async setupSelf() {
    const self = this;
    this._loggerEvents.onEvent(
      "d",
      "l",
      "reportStat",
      async (args: Array<any>) => {
        await (self._activeLogger || self._logger).reportStat(
          args[0],
          args[1],
          args[2]
        );
      }
    );
    this._loggerEvents.onEvent("d", "l", "debug", async (args: Array<any>) => {
      await (self._activeLogger || self._logger).debug(
        args[0],
        args[1],
        args[2],
        args[3]
      );
    });
    this._loggerEvents.onEvent("d", "l", "info", async (args: Array<any>) => {
      await (self._activeLogger || self._logger).info(
        args[0],
        args[1],
        args[2],
        args[3]
      );
    });
    this._loggerEvents.onEvent("d", "l", "warn", async (args: Array<any>) => {
      await (self._activeLogger || self._logger).warn(
        args[0],
        args[1],
        args[2],
        args[3]
      );
    });
    this._loggerEvents.onEvent("d", "l", "error", async (args: Array<any>) => {
      await (self._activeLogger || self._logger).error(
        args[0],
        args[1],
        args[2],
        args[3]
      );
    });
    this._loggerEvents.onReturnableEvent(
      "d",
      "l",
      "fatal",
      async (args: Array<any>) => {
        await (self._activeLogger || self._logger).error(
          args[0],
          args[1],
          args[2],
          args[3]
        );
        console.error("FATAL: EXIT");
        self._loggerEvents.emitEvent("d", "l", "fatal-e", []);
      }
    );
    this.log.info("Logger event core ready.");
  }

  async setupLogger(
    appId: string,
    runningDebug: boolean,
    runningLive: boolean,
    cwd: string,
    config: ConfigBase,
    plugin: IReadyPlugin
  ) {
    if (plugin.name === "log-default") return;
    await this.log.debug(`Import logging plugin: {name} from {file}`, {
      name: plugin.name,
      file: plugin.pluginFile,
    });
    const importedPlugin = await import(plugin.pluginFile);

    await this.log.debug(`Construct logging plugin: {name}`, {
      name: plugin.name,
    });

    let loggerPlugin =
      new (importedPlugin.Logger as unknown as typeof LoggerBase)(
        plugin.name,
        cwd,
        this.generateLoggerForPlugin(plugin.mappedName)
      );
    await this.log.debug(`Create logging plugin: {name}`, {
      name: plugin.name,
    });
    //const importedPlugin = await import(plugin.pluginFile);
    await this.log.info(
      "Setting up {pluginName} ({mappedName}) as new base logging platform",
      {
        pluginName: plugin.name,
        mappedName: plugin.mappedName,
      }
    );
    await this.log.info("Builing {pluginName} as new base logging platform", {
      pluginName: plugin.name,
    });
    SBBase.setupPlugin(appId, runningDebug, runningLive, loggerPlugin, config);

    this._activeLogger = loggerPlugin;
    await this._activeLogger.init();
    await this.log.info(
      "Ready {pluginName} ({mappedName}) as new base logging platform",
      {
        pluginName: plugin.name,
        mappedName: plugin.mappedName,
      }
    );
  }
  private generateNullLoggerForPlugin(): IPluginLogger {
    return {
      reportStat: async (key, value): Promise<void> => {},
      info: async (message, meta, hasPIData): Promise<void> => {},
      warn: async (message, meta, hasPIData): Promise<void> => {},
      error: async (message, meta, hasPIData): Promise<void> => {},
      fatal: async (message, meta, hasPIData): Promise<void> => {},
      debug: async (message, meta, hasPIData): Promise<void> => {},
    };
  }
  generateLoggerForPlugin(pluginName: string): IPluginLogger {
    const self = this;
    return {
      reportStat: async (key, value): Promise<void> =>
        await self._loggerEvents.emitEvent("d", "l", "reportStat", [
          pluginName,
          key,
          value,
        ]),
      info: async (message, meta, hasPIData): Promise<void> =>
        await self._loggerEvents.emitEvent("d", "l", "info", [
          pluginName,
          message,
          meta,
          hasPIData,
        ]),
      warn: async (message, meta, hasPIData): Promise<void> =>
        await self._loggerEvents.emitEvent("d", "l", "warn", [
          pluginName,
          message,
          meta,
          hasPIData,
        ]),
      error: async (message, meta, hasPIData): Promise<void> =>
        await self._loggerEvents.emitEvent("d", "l", "error", [
          pluginName,
          message,
          meta,
          hasPIData,
        ]),
      fatal: async (message, meta, hasPIData): Promise<void> => {
        await self._loggerEvents.emitEventAndReturn("d", "l", "fatal", 5, [
          pluginName,
          message,
          meta,
          hasPIData,
        ]);
      },
      debug: async (message, meta, hasPIData): Promise<void> =>
        await self._loggerEvents.emitEvent("d", "l", "debug", [
          pluginName,
          message,
          meta,
          hasPIData,
        ]),
    };
  }
}
