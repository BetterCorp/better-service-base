import { Tools } from "@bettercorp/tools/lib/Tools";
import { DefaultBase } from "../interfaces/base";
import { IPluginConfig } from "../interfaces/config";
import { ILogger, IPluginLogger, LogMeta } from "../interfaces/logger";

export class Logger<PluginConfigType extends IPluginConfig = any>
  extends DefaultBase<PluginConfigType>
  implements ILogger
{
  public formatLog<T extends string>(message: T, meta?: LogMeta<T>): string {
    if (!Tools.isObject(meta)) return message;

    let dataToParse = message.split("{");
    let outString = dataToParse[0];
    for (let i = 1; i < dataToParse.length; i++) {
      let removedVar = dataToParse[i].split("}");
      let referencedVar =
        Tools.GetValueFromObjectBasedOnStringPath(meta, removedVar[0]) || "";
      if (Tools.isArray(referencedVar))
        referencedVar = (referencedVar as Array<any>)
          .map((x) =>
            Tools.isSimpleType(x) ? x.toString() : JSON.stringify(x)
          )
          .join(",");
      if (Tools.isDate(referencedVar))
        referencedVar = (referencedVar as Date).toISOString();
      if (Tools.isObject(referencedVar))
        referencedVar = JSON.stringify(referencedVar);
      outString += referencedVar + removedVar[1];
    }
    return outString;
  }

  constructor(
    pluginName: string,
    cwd: string,
    defaultLogger: IPluginLogger
  ) {
    super(pluginName, cwd, defaultLogger);
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
