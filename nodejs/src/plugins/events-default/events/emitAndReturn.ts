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
import { BSBError, DTrace, IPluginLogging, IPluginMetrics } from "../../../index";

export class emitAndReturn
  extends EventEmitter {
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

  public async onReturnableEvent(
    trace: DTrace,
    pluginName: string,
    event: string,
    listener: { (trace: DTrace, args: Array<any>): Promise<any> },
  ): Promise<void> {
    this.log.debug(trace, "onReturnableEvent: listening to {pluginName}-{event}", {
      pluginName,
      event,
    });
    this.on(`${ pluginName }-${ event }`, async (etrace: DTrace, resolve, reject, data) => {
      // Create span for receiving and handling the returnable event with setup function trace details
      const receiveSpan = this.metrics.createSpan(etrace, "onReturnableEvent:receive", {
        pluginName,
        event,
        functionTraceId: trace.t,
        functionSpanId: trace.s
      });

      try {
        const result = await listener(receiveSpan.trace, data);
        resolve(result);
      } catch (error: any) {
        const errorObj = error instanceof Error ? error : new Error(error?.message || String(error));
        receiveSpan.error(errorObj);
        reject(error);
      } finally {
        receiveSpan.end();
      }
    });
  }

  public async emitEventAndReturn(
    trace: DTrace,
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    args: Array<any>,
  ): Promise<any> {
    // Create span for sending the returnable event
    const sendSpan = this.metrics.createSpan(trace, "emitEventAndReturn:send", {
      pluginName,
      event,
      timeoutSeconds
    });

    this.log.debug(sendSpan.trace, "emitReturnableEvent: emitting {pluginName}-{event}", {
      pluginName, event,
    });

    const self = this;
    return new Promise((resolve, reject) => {
      const timeoutHandler = setTimeout(() => {
        const timeoutError = new BSBError(sendSpan.trace, "Timeout");
        sendSpan.error(timeoutError);
        sendSpan.end();
        reject(timeoutError);
      }, timeoutSeconds * 1000);

      self.emit(
        `${ pluginName }-${ event }`,
        sendSpan.trace,
        (result: any) => {
          clearTimeout(timeoutHandler);
          resolve(result);
          sendSpan.end();
        },
        (error: any) => {
          clearTimeout(timeoutHandler);
          const errorObj = error instanceof Error ? error : new Error(error?.message || String(error));
          sendSpan.error(errorObj);
          reject(error);
          sendSpan.end();
        },
        args,
      );
    });
  }
}
