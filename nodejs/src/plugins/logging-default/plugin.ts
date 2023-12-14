import { BSBLogging, BSBLoggingConstructor } from "../../base/logging";
import { LogMeta } from "../../interfaces/logging";
import { CONSOLE_COLOURS, ConsoleColours } from "./colours";
import { LogFormatter } from "../../base/logFormatter";

export const LOG_LEVELS = {
  TSTAT: "Text Statistic",
  STAT: "Statistic",
  DEBUG: "Debug",
  INFO: "Info",
  WARN: "Warn",
  ERROR: "Error",
} as const;
export type LogLevels = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

export class Plugin extends BSBLogging<undefined> {
  dispose?(): void;
  init?(): void;
  run?(): void;
  private _mockedConsole?: { (level: LogLevels, message: string): void };
  private _mockConsole: boolean = false;
  private logFormatter: LogFormatter = new LogFormatter();

  //private mode: DEBUG_MODE = "development";
  constructor(
    config: BSBLoggingConstructor,
    mockConsole?: { (level: LogLevels, message: string): void }
  ) {
    super(config);
    this._mockedConsole = mockConsole;
    if (this._mockedConsole !== undefined) this._mockConsole = true;
  }

  private logEvent<T extends string>(
    level: LogLevels,
    plugin: string,
    message: T,
    meta?: LogMeta<T>
  ) {
    let formattedMessage = this.logFormatter.formatLog<T>(message, meta);
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

  public reportStat(plugin: string, key: string, value: number): void {
    if (!this.mode) return;
    this.logEvent(LOG_LEVELS.STAT, plugin, "[{key}={value}]", { key, value });
  }
  public reportTextStat<T extends string>(
    plugin: string,
    message: T,
    meta: LogMeta<T>
  ): void {
    if (!this.mode) return;
    this.logEvent<T>(LOG_LEVELS.TSTAT, plugin, message as T, meta);
  }
  public debug<T extends string>(
    plugin: string,
    message: T,
    meta: LogMeta<T>
  ): void {
    if (this.mode === "production") return;
    this.logEvent<T>(LOG_LEVELS.DEBUG, plugin, message as T, meta);
  }
  public info<T extends string>(
    plugin: string,
    message: T,
    meta: LogMeta<T>
  ): void {
    this.logEvent<T>(LOG_LEVELS.INFO, plugin, message as T, meta);
  }
  public warn<T extends string>(
    plugin: string,
    message: T,
    meta: LogMeta<T>
  ): void {
    this.logEvent<T>(LOG_LEVELS.WARN, plugin, message as T, meta);
  }
  public error<T extends string>(
    plugin: string,
    message: T,
    meta: LogMeta<T>
  ): void;
  public error(plugin: string, error: Error): void;
  public error<T extends string>(
    plugin: string,
    messageOrError: T | Error,
    meta?: LogMeta<T>
  ): void {
    let message =
      typeof messageOrError === "string"
        ? messageOrError
        : messageOrError.message;
    this.logEvent<T>(LOG_LEVELS.ERROR, plugin, message as T, meta);
    if (
      typeof messageOrError !== "string" &&
      messageOrError.stack !== undefined
    ) {
      console.error(messageOrError.stack.toString());
    }
  }
}
