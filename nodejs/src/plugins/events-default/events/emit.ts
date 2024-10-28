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
import {randomUUID} from "node:crypto";

export class emit
    extends EventEmitter {
  private log: IPluginLogger;
  private _lastReceivedMessageIds: Array<string> = [];
  private set lastReceivedMessageIds(value: string) {
    // remove after 50 messages
    if (this._lastReceivedMessageIds.length > 50) {
      this._lastReceivedMessageIds.shift();
    }
    this._lastReceivedMessageIds.push(value);
  }

  constructor(log: IPluginLogger) {
    super();
    this.log = log;
  }

  public dispose() {
    this.removeAllListeners();
  }

  public async onEvent(
      pluginName: string,
      event: string,
      listener: { (traceId: string, args: Array<any>): Promise<void> },
  ): Promise<void> {
    this.log.debug("onEvent: listening to {pluginName}-{event}", {
      pluginName,
      event,
    });
    this.on(`${pluginName}-${event}`, (traceId: string, args: any) => {
      if (this._lastReceivedMessageIds.includes(args.msgID)) {
        return;
      }
      this.lastReceivedMessageIds = args.msgID;
      listener(traceId, args.data);
    });
  }

  public async emitEvent(
      pluginName: string,
      event: string,
      traceId: string,
      args: Array<any>,
  ): Promise<void> {
    this.log.debug("emitEvent: emitting {pluginName}-{event} with traceId {traceId}", {
      pluginName, event, traceId: traceId ?? "no-traceId",
    });
    this.emit(`${pluginName}-${event}`, traceId, {
      msgID: randomUUID(),
      data: args,
    });
  }
}
