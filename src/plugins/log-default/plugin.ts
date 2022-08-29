import { IPluginConfig } from "../../interfaces/config";
import { IPluginLogger, LogMeta } from "../../interfaces/logger";
import { LoggerBase } from "../../logger/logger";

export class Logger<
  PluginConfigType extends IPluginConfig = any
> extends LoggerBase<PluginConfigType> {
  constructor(pluginName: string, cwd: string, defaultLogger: IPluginLogger) {
    super(pluginName, cwd, defaultLogger);
  }

  public async reportStat(
    plugin: string,
    key: string,
    value: number
  ): Promise<void> {
    if (!this.runningDebug) return;
    console.debug(`[STAT][${plugin.toUpperCase()}][${key}=${value}]`);
  }
  public async debug<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    if (!this.runningDebug) return;
    console.debug(
      `[DEBUG][${plugin.toUpperCase()}] ${this.formatLog<T>(message, meta)}`,
      meta
    );
  }
  public async info<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    if (this.runningLive && hasPIData === true) return;
    console.info(
      `[${plugin.toUpperCase()}] ${this.formatLog<T>(message, meta)}`
    );
  }
  public async warn<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    if (this.runningLive && hasPIData === true) return;
    console.warn(
      `[${plugin.toUpperCase()}] ${this.formatLog<T>(message, meta)}`
    );
  }
  public async error<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    if (this.runningLive && hasPIData === true) return;
    console.error(
      `[${plugin.toUpperCase()}] ${this.formatLog<T>(message, meta)}`
    );
  }
  public async fatal<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    if (this.runningLive && hasPIData === true) return;
    console.error(
      `[FATAL][${plugin.toUpperCase()}] ${this.formatLog<T>(message, meta)}`
    );
  }
}
export class DefaultLogger<
  PluginConfigType extends IPluginConfig = any
> extends Logger<PluginConfigType> {}
