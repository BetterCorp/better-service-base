import { Tools } from "@bettercorp/tools/lib/Tools";
import { CLogger, LogMeta } from "../interfaces/logger";

export class Formatter {
  static formatLog(message: string, meta?: LogMeta) {
    if (!Tools.isObject(meta)) return message;

    let dataToParse = message.split("{");
    let outString = dataToParse[0];
    for (let i = 1; i < dataToParse.length; i++) {
      let removedVar = dataToParse[i].split("}");
      outString +=
        (Tools.GetValueFromObjectBasedOnStringPath(meta, removedVar[0]) || "") +
        removedVar[1];
    }
    return outString;
  }
}

export class Logger extends CLogger {
  async debug(
    plugin: string,
    message: string,
    meta?: LogMeta,
    hasPIData?: boolean
  ): Promise<void> {
    if (!this.appConfig.runningInDebug) return;
    console.debug(`[DEBUG][${plugin.toUpperCase()}] ${Formatter.formatLog(message, meta)}`, meta);
  }
  async info(
    plugin: string,
    message: string,
    meta?: LogMeta,
    hasPIData?: boolean
  ): Promise<void> {
    if (this.appConfig.runningLive && hasPIData === true) return;
    console.info(`[${plugin.toUpperCase()}] ${Formatter.formatLog(message, meta)}`);
  }
  async warn(
    plugin: string,
    message: string,
    meta?: LogMeta,
    hasPIData?: boolean
  ): Promise<void> {
    if (this.appConfig.runningLive && hasPIData === true) return;
    console.warn(`[${plugin.toUpperCase()}] ${Formatter.formatLog(message, meta)}`);
  }
  async error(
    plugin: string,
    message: string,
    meta?: LogMeta,
    hasPIData?: boolean
  ): Promise<void> {
    if (this.appConfig.runningLive && hasPIData === true) return;
    console.error(`[${plugin.toUpperCase()}] ${Formatter.formatLog(message, meta)}`);
  }
  async fatal(
    plugin: string,
    message: string,
    meta?: LogMeta,
    hasPIData?: boolean
  ): Promise<void> {
    if (this.appConfig.runningLive && hasPIData === true) return;
    console.error(`[FATAL][${plugin.toUpperCase()}] ${Formatter.formatLog(message, meta)}`);
  }
}
