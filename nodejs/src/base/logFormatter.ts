/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2024 BetterCorp (PTY) Ltd  
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program. 
 * The commercial license allows you to use the Program in a closed-source manner, 
 * including the right to create derivative works that are not subject to the terms 
 * of the AGPL. 
 *
 * To obtain a commercial license, please contact the copyright holders at 
 * https://www.bettercorp.dev. The terms and conditions of the commercial license 
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import {DTrace, LogMeta, SafeLogData, UnsafeLogData} from "../interfaces";
import {Tools} from "./tools";

/**
 * Log Formatter
 * This class is used to format the log data to a string
 * @group Logging
 * @category Tools
 * @example
 * ```ts
 * const logFormatter = new LogFormatter();
 * const formattedLog = logFormatter.formatLog("This {a} a log {b}", {
 *  a: "is",
 *  b: "message",
 * });
 * ```
 */
export class LogFormatter {
  private isUnsafeLogData(value: any): value is UnsafeLogData {
    return Tools.isObject(value) && !Tools.isNullOrUndefined(value.safeValue);
  }

  private getSafeData<T extends string>(data: LogMeta<T>, key: string) {
    if (Tools.isNullOrUndefined(data)) {
      return null;
    }
    const dataFromKeyVP = (
        data as Record<string, UnsafeLogData | SafeLogData>
    )[
        key
        ];
    if (this.isUnsafeLogData(dataFromKeyVP)) {
      return dataFromKeyVP.safeValue;
    }
    return dataFromKeyVP;
  }

  private formatData(meta: any, key: string) {
    const referencedVar = this.getSafeData(meta, key);
    if (Tools.isNullOrUndefined(referencedVar)) {
      return "*null/undefined*";
    }
    if (Tools.isDate(referencedVar)) {
      return referencedVar.toISOString();
    }
    if (Tools.isString(referencedVar)) {
      return referencedVar;
    }
    if (Tools.isArray(referencedVar)) {
      return (
          referencedVar as Array<any>
      )
          .map((x) =>
              Tools.isSimpleType(x)
              ? Tools.isString(x)
                ? x
                : x.toString()
              : JSON.stringify(x),
          )
          .join(",");
    }
    /*if (
     Tools.isObject(referencedVar) &&
     Tools.isFunction(referencedVar.toString)
     )
     return referencedVar.toString();*/
    return JSON.stringify(referencedVar);
  }
  
  public formatLog<T extends string>(trace: DTrace, message: T, meta?: LogMeta<T>): string {
    let nMeta = {
      __t: trace.t,
      __s: trace.s,
      ...(meta ?? {}),
    };
    
    const dataToParse = `[{__t}:{__s}] ${message}`.split("{");
    let outString = dataToParse[0];
    for (let i = 1 ; i < dataToParse.length ; i++) {
      const removedVar = dataToParse[i].split("}");
      outString += this.formatData(nMeta, removedVar[0]) + removedVar[1];
    }
    return outString;
  }
}
