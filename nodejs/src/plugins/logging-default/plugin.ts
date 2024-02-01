import {
  LogMeta,
  BSBLogging,
  BSBLoggingConstructor,
  LogFormatter,
} from "../../";
import { CONSOLE_COLOURS, ConsoleColours } from "./colours";

export const LOG_LEVELS = {
  TSTAT: "Text Statistic",
  STAT: "Statistic",
  DEBUG: "Debug",
  INFO: "Info",
  WARN: "Warn",
  ERROR: "Error",
} as const;
export type LogLevels = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

export class Plugin extends BSBLogging {
  dispose?(): void;
  init?(): void;
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
    meta?: LogMeta<T>,
    additionalToConsole?: any
  ) {
    let formattedMessage = this.logFormatter.formatLog<T>(message, meta);
    formattedMessage = `[${plugin.toUpperCase()}] ${formattedMessage}`;
    let func: any = console.debug;
    let colour: Array<ConsoleColours> = [
      CONSOLE_COLOURS.BgBlack,
      CONSOLE_COLOURS.FgWhite,
    ];
    let colour2: Array<ConsoleColours> = [];
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
      colour2 = [CONSOLE_COLOURS.BgBlack, CONSOLE_COLOURS.FgRed];
    }
    if (this._mockConsole) return this._mockedConsole!(level, formattedMessage);
    if (additionalToConsole)
      formattedMessage += colour2.join("") + "\n" + additionalToConsole;
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
    errorOrMeta?: Error | LogMeta<T>,
    meta?: LogMeta<T>
  ): void {
    const hasErrorDefinition = meta !== undefined;
    const inclStack = errorOrMeta instanceof Error && errorOrMeta.stack;

    this.logEvent<T>(
      LOG_LEVELS.ERROR,
      plugin,
      message as T,
      hasErrorDefinition ? meta : (errorOrMeta as LogMeta<T>),
      inclStack ? "Stack trace for: " + errorOrMeta.stack : undefined
    );
  }
}
