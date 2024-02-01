import { SBLogging } from "../serviceBase";
import { DEBUG_MODE, SmartLogMeta, IPluginLogger } from "../interfaces";
import { BSBError } from "./errorMessages";

export class PluginLogger implements IPluginLogger {
  private logging: SBLogging;
  private pluginName: string;
  private canDebug = false;
  constructor(mode: DEBUG_MODE, plugin: string, logging: SBLogging) {
    this.logging = logging;
    this.pluginName = plugin;
    if (mode !== "production") {
      this.canDebug = true;
    }
  }
  public debug<T extends string>(message: T, ...meta: SmartLogMeta<T>): void {
    if (this.canDebug)
      this.logging.logBus.emit("debug", this.pluginName, message, ...meta);
  }
  public reportStat(key: string, value: number): void {
    this.logging.logBus.emit("reportStat", this.pluginName, key, value);
  }
  public reportTextStat<T extends string>(
    message: T,
    ...meta: SmartLogMeta<T>
  ): void {
    this.logging.logBus.emit(
      "reportTextStat",
      this.pluginName,
      message,
      ...meta
    );
  }
  public info<T extends string>(message: T, ...meta: SmartLogMeta<T>): void {
    this.logging.logBus.emit("info", this.pluginName, message, ...meta);
  }
  public warn<T extends string>(message: T, ...meta: SmartLogMeta<T>): void {
    this.logging.logBus.emit("warn", this.pluginName, message, ...meta);
  }
  public error<T extends string>(error: BSBError<T>): void;
  public error<T extends string>(
    message: T,
    error: Error,
    meta: SmartLogMeta<T>
  ): void;
  public error<T extends string>(message: T, meta: SmartLogMeta<T>): void;
  public error<T extends string>(
    messageOrError: T | BSBError<T>,
    errorOrMeta?: Error | SmartLogMeta<T>,
    meta?: SmartLogMeta<T>
  ): void {
    if (messageOrError instanceof BSBError) {
      if (messageOrError.raw !== null) {
        this.logging.logBus.emit(
          "error",
          this.pluginName,
          messageOrError.raw.message,
          messageOrError,
          messageOrError.raw.meta
        );
        return;
      }
      this.logging.logBus.emit(
        "error",
        this.pluginName,
        messageOrError.message,
        messageOrError,
        {}
      );
      return;
    }
    this.logging.logBus.emit(
      "error",
      this.pluginName,
      messageOrError,
      errorOrMeta,
      meta
    );
  }
}
