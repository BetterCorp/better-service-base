import { IPluginLogger, LogMeta } from "../../interfaces/logger";
import { LoggerBase } from "../../logger/logger";
import { PluginConfig } from "./sec.config";

export enum LogLevels {
  STAT = -2,
  DEBUG = -1,
  INFO = 0,
  WARN = 1,
  ERROR = 2,
}
export class Logger extends LoggerBase<PluginConfig> {
  private _mockedConsole?: { (level: number, message: string): void };
  private _mockConsole: boolean = false;
  constructor(
    pluginName: string,
    cwd: string,
    defaultLogger: IPluginLogger,
    mockConsole?: { (level: number, message: string): void }
  ) {
    super(pluginName, cwd, defaultLogger);
    this._mockedConsole = mockConsole;
    if (this._mockedConsole !== undefined) this._mockConsole = true;
  }

  private logEvent<T extends string>(
    level: LogLevels,
    plugin: string,
    message: T,
    meta?: LogMeta<T>
  ) {
    let formattedMessage = this.formatLog<T>(message, meta);
    formattedMessage = `[${plugin.toUpperCase()}] ${formattedMessage}`;
    let func: any = console.debug;
    if (level === LogLevels.STAT)
      formattedMessage = `[STAT] ${formattedMessage}`;
    if (level === LogLevels.DEBUG)
      formattedMessage = `[DEBUG] ${formattedMessage}`;
    if (level === LogLevels.INFO) {
      formattedMessage = `[INFO] ${formattedMessage}`;
      func = console.log;
    }
    if (level === LogLevels.WARN) {
      formattedMessage = `[WARN] ${formattedMessage}`;
      func = console.warn;
    }
    if (level === LogLevels.ERROR) {
      formattedMessage = `[ERROR] ${formattedMessage}`;
      func = console.error;
    }
    if (this._mockConsole) return this._mockedConsole!(level, formattedMessage);
    func(formattedMessage);
  }

  public async reportStat(
    plugin: string,
    key: string,
    value: number
  ): Promise<void> {
    if (!this.runningDebug) return;
    this.logEvent(LogLevels.STAT, plugin, "[{key}={value}]", { key, value });
  }
  public async debug<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    if (!this.runningDebug) return;
    this.logEvent<T>(LogLevels.DEBUG, plugin, message as T, meta);
  }
  public async info<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    if (this.runningLive && hasPIData === true) return;
    this.logEvent<T>(LogLevels.INFO, plugin, message as T, meta);
  }
  public async warn<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    if (this.runningLive && hasPIData === true) return;
    this.logEvent<T>(LogLevels.WARN, plugin, message as T, meta);
  }
  public async error<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
  public async error(plugin: string, error: Error): Promise<void>;
  public async error<T extends string>(
    plugin: string,
    messageOrError: T | Error,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    let message =
      typeof messageOrError === "string"
        ? messageOrError
        : messageOrError.message;
    if (this.runningLive && hasPIData === true) return;
    this.logEvent<T>(LogLevels.ERROR, plugin, message as T, meta);
    if (
      typeof messageOrError !== "string" &&
      messageOrError.stack !== undefined
    ) {
      console.error(messageOrError.stack.toString());
    }
  }
}
