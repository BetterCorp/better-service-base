import { LogFormatter } from "./index";
import { LogMeta } from "../interfaces";

export type EMetaDef<T extends string> = {
  message: T;
  meta: LogMeta<T>;
};
export class BSBError<T extends string> extends Error {
  constructor(errorKey: string, message: T, meta: LogMeta<T>);
  constructor(message: T, meta: LogMeta<T>);
  constructor(
    errorKeyOrMessage: string | T,
    messageOrMeta: T | LogMeta<T>,
    meta?: LogMeta<T>
  ) {
    const formatter = new LogFormatter();
    if (meta === undefined && typeof messageOrMeta === "object") {
      super(formatter.formatLog(errorKeyOrMessage, messageOrMeta));
      this.name = "BSBError-Generic";
      this.raw = {
        message: errorKeyOrMessage,
        meta: messageOrMeta,
      };
    } else if (typeof messageOrMeta === "string" && typeof meta === "object") {
      super(formatter.formatLog(messageOrMeta, meta));
      this.name = "BSBError-" + errorKeyOrMessage;
      this.raw = {
        message: messageOrMeta,
        meta: meta,
      };
    } else {
      super(errorKeyOrMessage);
      this.name = "BSBError-Generic";
      this.raw = {
        message: errorKeyOrMessage,
        meta: messageOrMeta ?? {},
      };
    }
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
    "INCORRECT_REFERENCE",
    "Method not implemented: {class}.{method}",
    {
      class: className,
      method: method,
    }
  );
}
