import { LoggerBase } from "../logger/logger";
import { ILogger, IPluginLogger } from "../interfaces/logger";
import { DefaultLogger } from "../plugins/log-default/plugin";
import { SBBase } from "./base";
import { ConfigBase } from "../config/config";
import { DefaultEvents } from "../plugins/events-default/plugin";

export class SBLogger {
  private log: IPluginLogger;
  private _logger: DefaultLogger;
  private _loggerEvents: DefaultEvents;
  private _activeLogger: LoggerBase | undefined;
  constructor(CORE_PLUGIN_NAME: string, debug: boolean) {
    this._logger = new DefaultLogger("default-logger", "./", undefined!);
    SBBase.setupPlugin(this._logger, {
      runningDebug: debug,
      runningLive: true,
    } as any);
    this._loggerEvents = new DefaultEvents(
      "default-logger-events",
      "./",
      this.generateNullLoggerForPlugin()
    );
    this.log = this.generateLoggerForPlugin(`${CORE_PLUGIN_NAME}-logger`);
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
        process.exit(2);
      }
    );
    this.log.info("Logger event core ready.");
  }

  async setupLogger(
    cwd: string,
    config: ConfigBase,
    logger: LoggerBase,
    pluginName: string
  ) {
    //const importedPlugin = await import(plugin.pluginFile);
    await this.log.info(
      "Setting up {pluginName} as new base logging platform",
      {
        pluginName,
      }
    );
    let loggerReady = new (logger as unknown as typeof LoggerBase)(
      pluginName,
      cwd,
      this.generateLoggerForPlugin(pluginName)
    );
    await this.log.info("Builing {pluginName} as new base logging platform", {
      pluginName,
    });
    SBBase.setupPlugin(loggerReady, config);
    if ((loggerReady as ILogger).init !== undefined) {
      await this.log.info(
        "Initialized {pluginName} as new base logging platform",
        {
          pluginName,
        }
      );
      await (loggerReady as ILogger).init!();
    }
    this._activeLogger = loggerReady;
    await this.log.info("Ready {pluginName} as new base logging platform", {
      pluginName,
    });
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
