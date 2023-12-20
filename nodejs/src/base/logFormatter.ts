import { Tools } from "@bettercorp/tools/lib/Tools";
import { LogMeta, SafeLogData, UnsafeLogData } from "../interfaces/logging";

export class LogFormatter {
  private isUnsafeLogData(value: any): value is UnsafeLogData {
    return Tools.isObject(value) && !Tools.isNullOrUndefined(value.safeValue);
  }
  private getSafeData<T extends string>(data: LogMeta<T>, key: string) {
    if (Tools.isNullOrUndefined(data)) return null;
    const dataFromKeyVP = (data as Record<string, UnsafeLogData | SafeLogData>)[
      key
    ];
    if (this.isUnsafeLogData(dataFromKeyVP)) return dataFromKeyVP.safeValue;
    return dataFromKeyVP;
  }
  private formatData(meta: any, key: string) {
    const referencedVar = this.getSafeData(meta, key);
    if (Tools.isNullOrUndefined(referencedVar)) return "*null/undefined*";
    if (Tools.isDate(referencedVar)) return referencedVar.toISOString();
    if (Tools.isString(referencedVar)) return referencedVar;
    if (Tools.isArray(referencedVar))
      return (referencedVar as Array<any>)
        .map((x) =>
          Tools.isSimpleType(x)
            ? Tools.isString(x)
              ? x
              : x.toString()
            : JSON.stringify(x)
        )
        .join(",");
    /*if (
      Tools.isObject(referencedVar) &&
      Tools.isFunction(referencedVar.toString)
    )
      return referencedVar.toString();*/
    return JSON.stringify(referencedVar);
  }
  public formatLog<T extends string>(message: T, meta?: LogMeta<T>): string {
    //console.log(`_${message}:${Tools.isObject(meta)}`);
    if (!Tools.isObject(meta)) return message;

    const dataToParse = message.split("{");
    let outString = dataToParse[0];
    for (let i = 1; i < dataToParse.length; i++) {
      const removedVar = dataToParse[i].split("}");
      outString += this.formatData(meta, removedVar[0]) + removedVar[1];
    }
    return outString;
  }
}
