import { Tools } from "@bettercorp/tools/lib/Tools";
import { ErrorMessages } from "../interfaces/static";
import { DefaultBase } from "../interfaces/base";
import { IPluginConfig } from "../interfaces/config";
import { ILogger, IPluginLogger, LogMeta } from "../interfaces/logger";

export class LoggerBase<PluginConfigType extends IPluginConfig = any>
  extends DefaultBase<PluginConfigType>
  implements ILogger
{
  protected formatLog<T extends string>(message: T, meta?: LogMeta<T>): string {
    //console.log(`_${message}:${Tools.isObject(meta)}`);
    if (!Tools.isObject(meta)) return message;

    let dataToParse = message.split("{");
    let outString = dataToParse[0];
    for (let i = 1; i < dataToParse.length; i++) {
      let removedVar = dataToParse[i].split("}");
      let referencedVar = Tools.GetValueFromObjectBasedOnStringPath(
        meta,
        removedVar[0]
      );
      //console.log(`:${removedVar[0]}:${referencedVar}`, meta);
      if (Tools.isNullOrUndefined(referencedVar))
        referencedVar = "*null/undefined*";
      else if (Tools.isArray(referencedVar))
        referencedVar = (referencedVar as Array<any>)
          .map((x) =>
            Tools.isSimpleType(x) ? x.toString() : JSON.stringify(x)
          )
          .join(",");
      else if (Tools.isDate(referencedVar))
        referencedVar = referencedVar.toISOString();
      else if (
        Tools.isObject(referencedVar) ||
        !Tools.isFunction(referencedVar.toString)
      )
        referencedVar = JSON.stringify(referencedVar);
      else {
        referencedVar = referencedVar.toString();
      }
      outString += referencedVar + removedVar[1];
    }
    return outString;
  }

  constructor(
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    defaultLogger: IPluginLogger
  ) {
    super(pluginName, cwd, pluginCwd, defaultLogger);
  }

  public async reportStat(
    plugin: string,
    key: string,
    value: number
  ): Promise<void> {
    throw ErrorMessages.LoggerNotImplementedProperly;
  }
  public async reportTextStat<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    throw ErrorMessages.LoggerNotImplementedProperly;
  }
  public async debug<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    throw ErrorMessages.LoggerNotImplementedProperly;
  }
  public async info<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    throw ErrorMessages.LoggerNotImplementedProperly;
  }
  public async warn<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    throw ErrorMessages.LoggerNotImplementedProperly;
  }
  public async error<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void> {
    throw ErrorMessages.LoggerNotImplementedProperly;
  }
}
