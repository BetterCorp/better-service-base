import { SBLogging } from "../serviceBase";
import { DEBUG_MODE, SmartLogMeta, IPluginLogger } from "../interfaces";

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
      this.logging.logBus.emit("debug", this.pluginName, message, meta[0]);
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
      meta[0]
    );
  }
  public info<T extends string>(message: T, ...meta: SmartLogMeta<T>): void {
    this.logging.logBus.emit("info", this.pluginName, message, meta[0]);
  }
  public warn<T extends string>(message: T, ...meta: SmartLogMeta<T>): void {
    this.logging.logBus.emit("warn", this.pluginName, message, meta[0]);
  }
  public error<T extends string>(message: T, ...meta: SmartLogMeta<T>): void {
    this.logging.logBus.emit("error", this.pluginName, message, meta[0]);
  }
}
