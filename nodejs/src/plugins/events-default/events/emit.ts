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

import { EventEmitter } from "node:events";
import { DTrace, IPluginLogging, IPluginMetrics } from "../../../index";
import { randomUUID } from "node:crypto";

export class emit
  extends EventEmitter {
  private log: IPluginLogging;
  private metrics: IPluginMetrics;
  private _lastReceivedMessageIds: Array<string> = [];
  private set lastReceivedMessageIds(value: string) {
    // remove after 50 messages
    if (this._lastReceivedMessageIds.length > 50) {
      this._lastReceivedMessageIds.shift();
    }
    this._lastReceivedMessageIds.push(value);
  }

  constructor(log: IPluginLogging, metrics: IPluginMetrics) {
    super();
    this.log = log;
    this.metrics = metrics;
  }

  public dispose() {
    this.removeAllListeners();
  }

  public async onEvent(
    trace: DTrace,
    pluginName: string,
    event: string,
    listener: { (trace: DTrace, args: Array<any>): Promise<void> },
  ): Promise<void> {
    this.log.debug(trace, "onEvent: listening to {pluginName}-{event}", {
      pluginName,
      event,
    });
    this.on(`${ pluginName }-${ event }`, async (etrace: DTrace, args: any) => {
      if (this._lastReceivedMessageIds.includes(args.msgID)) {
        return;
      }
      this.lastReceivedMessageIds = args.msgID;

      // Create span for receiving the event with setup function trace details
      const receiveSpan = this.metrics.createSpan(etrace, "onEvent:receive", {
        pluginName,
        event,
        functionTraceId: trace.t,
        functionSpanId: trace.s,
        messageId: args.msgID
      });

      try {
        await listener(receiveSpan.trace, args.data);
      } catch (error: any) {
        const errorObj = error instanceof Error ? error : new Error(error?.message || String(error));
        receiveSpan.error(errorObj);
        throw error;
      } finally {
        receiveSpan.end();
      }
    });
  }

  public async emitEvent(
    trace: DTrace,
    pluginName: string,
    event: string,
    args: Array<any>,
  ): Promise<void> {
    const msgID = randomUUID();

    // Create span for sending the event
    const sendSpan = this.metrics.createSpan(trace, "emitEvent:send", {
      pluginName,
      event,
      messageId: msgID
    });

    try {
      this.log.debug(sendSpan.trace, "emitEvent: emitting {pluginName}-{event}", {
        pluginName, event,
      });

      this.emit(`${ pluginName }-${ event }`, sendSpan.trace, {
        msgID,
        data: args,
      });
    } catch (error: any) {
      const errorObj = error instanceof Error ? error : new Error(error?.message || String(error));
      sendSpan.error(errorObj);
      throw error;
    } finally {
      sendSpan.end();
    }
  }
}
