/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd  
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

export class broadcast extends EventEmitter {
  private log: IPluginLogging;
  private metrics: IPluginMetrics;

  constructor(log: IPluginLogging, metrics: IPluginMetrics) {
    super();
    this.log = log;
    this.metrics = metrics;
  }

  public dispose() {
    this.removeAllListeners();
  }

  public async onBroadcast(
    trace: DTrace,
    pluginName: string,
    event: string,
    listener: { (trace: DTrace, args: Array<any>): Promise<void> }
  ): Promise<void> {
    this.log.debug(trace, "onBroadcast: listening to {pluginName}-{event}", {
      pluginName,
      event,
    });
    this.on(`${ pluginName }-${ event }`, async (etrace: DTrace, args: any[]) => {
      // Create span for receiving the broadcast with setup function trace details
      const receiveSpan = this.metrics.createSpan(etrace, "onBroadcast:receive", {
        pluginName,
        event,
        functionTraceId: trace.t,
        functionSpanId: trace.s
      });

      try {
        await listener(receiveSpan.trace, args);
      } catch (error: any) {
        const errorObj = error instanceof Error ? error : new Error(error?.message || String(error));
        receiveSpan.error(errorObj);
        throw error;
      } finally {
        receiveSpan.end();
      }
    });
  }

  public async emitBroadcast(
    trace: DTrace,
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void> {
    // Create span for sending the broadcast
    const sendSpan = this.metrics.createSpan(trace, "emitBroadcast:send", {
      pluginName,
      event,
    });

    try {
      this.log.debug(sendSpan.trace, "emitBroadcast: emitting {pluginName}-{event}", {
        pluginName, event,
      });
      this.emit(`${ pluginName }-${ event }`, sendSpan.trace, args);
    } catch (error: any) {
      const errorObj = error instanceof Error ? error : new Error(error?.message || String(error));
      sendSpan.error(errorObj);
      throw error;
    } finally {
      sendSpan.end();
    }
  }
}
