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

import {EventEmitter} from "node:events";
import {IPluginLogger} from "../../../index";

export class emitAndReturn
    extends EventEmitter {
  private log: IPluginLogger;

  constructor(log: IPluginLogger) {
    super();
    this.log = log;
  }

  public dispose() {
    this.removeAllListeners();
  }

  public async onReturnableEvent(
      pluginName: string,
      event: string,
      listener: { (traceId: string, args: Array<any>): Promise<any> },
  ): Promise<void> {
    this.log.debug("onReturnableEvent: listening to {pluginName}-{event}", {
      pluginName,
      event,
    });
    this.on(`${pluginName}-${event}`, async (resolve, reject, traceId, data) => {
      try {
        resolve(await listener(traceId, data));
      } catch (exc) {
        reject(exc);
      }
    });
  }

  public async emitEventAndReturn(
      pluginName: string,
      event: string,
      traceId: string,
      timeoutSeconds: number,
      args: Array<any>,
  ): Promise<any> {
    this.log.debug("emitReturnableEvent: emitting {pluginName}-{event} with traceId {traceId}", {
      pluginName, event, traceId: traceId ?? "no-traceId",
    });
    const self = this;
    return new Promise((resolve, reject) => {
      const timeoutHandler = setTimeout(() => {
        reject("Timeout");
      }, timeoutSeconds * 1000);
      self.emit(
          `${pluginName}-${event}`,
          (args: any) => {
            clearTimeout(timeoutHandler);
            resolve(args);
          },
          (args: any) => {
            clearTimeout(timeoutHandler);
            reject(args);
          },
          traceId,
          args,
      );
    });
  }
}
