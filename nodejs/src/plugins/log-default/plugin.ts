import { IPluginLogger, LogMeta } from "../../interfaces/logger";
import { LoggerBase } from "../../logger/logger";
import { CONSOLE_COLOURS, ConsoleColours } from "./colours";
import { PluginConfig } from "./sec.config";

export const LOG_LEVELS = {
  TSTAT: "Text Statistic",
  STAT: "Statistic",
  DEBUG: "Debug",
  INFO: "Info",
  WARN: "Warn",
  ERROR: "Error",
} as const;
export type LogLevels = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

export class Logger extends LoggerBase<PluginConfig> {
  private _mockedConsole?: { (level: LogLevels, message: string): void };
  private _mockConsole: boolean = false;
  constructor(
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    defaultLogger: IPluginLogger,
    mockConsole?: { (level: LogLevels, message: string): void }
  ) {
    super(pluginName, cwd, pluginCwd, defaultLogger);
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
    let colour: Array<ConsoleColours> = [
      CONSOLE_COLOURS.BgBlack,
      CONSOLE_COLOURS.FgWhite,
    ];
    if (level === LOG_LEVELS.STAT) {
      formattedMessage = `[STAT] ${formattedMessage}`;
      colour = [CONSOLE_COLOURS.BgYellow, CONSOLE_COLOURS.FgBlack];
    }
    if (level === LOG_LEVELS.TSTAT) {
      formattedMessage = `[STAT] ${formattedMessage}`;
      colour = [CONSOLE_COLOURS.BgCyan, CONSOLE_COLOURS.FgWhite];
    }
    if (level === LOG_LEVELS.DEBUG) {
      formattedMessage = `[DEBUG] ${formattedMessage}`;
      colour = [CONSOLE_COLOURS.BgBlue, CONSOLE_COLOURS.FgWhite];
    }
    if (level === LOG_LEVELS.INFO) {
      formattedMessage = `[INFO] ${formattedMessage}`;
      func = console.log;
      colour = [];
    }
    if (level === LOG_LEVELS.WARN) {
      formattedMessage = `[WARN] ${formattedMessage}`;
      func = console.warn;
      colour = [CONSOLE_COLOURS.BgBlack, CONSOLE_COLOURS.FgRed];
    }
    if (level === LOG_LEVELS.ERROR) {
      formattedMessage = `[ERROR] ${formattedMessage}`;
      func = console.error;
      colour = [CONSOLE_COLOURS.BgRed, CONSOLE_COLOURS.FgBlack];
    }
    if (this._mockConsole) return this._mockedConsole!(level, formattedMessage);
    func(colour.join("") + "%s" + CONSOLE_COLOURS.Reset, formattedMessage);
  }

  public async reportStat(
    plugin: string,
    key: string,
    value: number
  ): Promise<void> {
    if (!this.runningDebug) return;
    this.logEvent(LOG_LEVELS.STAT, plugin, "[{key}={value}]", { key, value });
  }
  public async reportTextStat<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    if (!this.runningDebug) return;
    this.logEvent<T>(LOG_LEVELS.TSTAT, plugin, message as T, meta);
  }
  public async debug<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    if (!this.runningDebug) return;
    this.logEvent<T>(LOG_LEVELS.DEBUG, plugin, message as T, meta);
  }
  public async info<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    if (this.runningLive && hasPIData === true) return;
    this.logEvent<T>(LOG_LEVELS.INFO, plugin, message as T, meta);
  }
  public async warn<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    if (this.runningLive && hasPIData === true) return;
    this.logEvent<T>(LOG_LEVELS.WARN, plugin, message as T, meta);
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
    this.logEvent<T>(LOG_LEVELS.ERROR, plugin, message as T, meta);
    if (
      typeof messageOrError !== "string" &&
      messageOrError.stack !== undefined
    ) {
      console.error(messageOrError.stack.toString());
    }
  }
}
