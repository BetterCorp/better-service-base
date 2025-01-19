import { LogFormatter } from "./index";
import { LogMeta, SmartLogMeta } from "../interfaces";

export type EMetaDef<T extends string> = {
  message: T;
  meta: LogMeta<T>;
};
export class BSBError<T extends string> extends Error {
  constructor(message: T, ...meta: SmartLogMeta<T>) {
    const formatter = new LogFormatter();
    super(formatter.formatLog(message, ...meta));
    this.name = "BSBError-Generic";
    this.raw = {
      message: message,
      meta: meta,
    };
  }
  public raw: EMetaDef<string> | null = null;
  public toString(): string {
    return this.message;
  }
}

export function BSB_ERROR_METHOD_NOT_IMPLEMENTED(
  className: string,
  method: string
) {
  return new BSBError(
    "Method not implemented: {class}.{method}",
    {
      class: className,
      method: method,
    }
  );
}
