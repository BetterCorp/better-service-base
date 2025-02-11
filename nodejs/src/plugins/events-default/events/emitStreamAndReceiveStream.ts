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
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { BSBError, DTrace, IPluginLogging, IPluginMetrics } from "../../../index";

export class emitStreamAndReceiveStream
  extends EventEmitter {
  // If we try receive or send a stream and the other party is not ready for some reason, we will automatically timeout in 5s.
  private readonly staticCommsTimeout = 1000;
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

  async receiveStream(
    trace: DTrace,
    event: string,
    listener: { (etrace: DTrace, error: Error | null, stream: Readable): Promise<void> },
    timeoutSeconds: number = 60,
  ): Promise<string> {
    // Create span for receiving stream with setup function trace details
    const receiveSpan = this.metrics.createSpan(trace, "receiveStream:receive", {
      event,
      timeoutSeconds,
      functionTraceId: trace.t,
      functionSpanId: trace.s
    });

    const streamId = `${ randomUUID() }=${ timeoutSeconds }`;
    this.log.debug(receiveSpan.trace, "receiveStream: listening to {streamId}", {
      streamId,
    });

    const self = this;
    return new Promise((resolve) => {
      const receiptTimeoutHandler: NodeJS.Timeout = setTimeout(() => {
        const timeoutError = new BSBError(receiveSpan.trace, "Receive Receipt Timeout");
        receiveSpan.error(timeoutError);
        listener(receiveSpan.trace, timeoutError, null!);
        self.emit(`${ streamId }-error`, receiveSpan.trace, timeoutError);
        self.removeAllListeners(streamId);
        receiveSpan.end();
      }, self.staticCommsTimeout);

      self.once(streamId, (ttrace: DTrace, stream: Readable): void => {
        clearTimeout(receiptTimeoutHandler);
        self.emit(`${ streamId }-emit`);

        stream.on("error", (error: any) => {
          const errorObj = error instanceof Error ? error : new Error(error?.message || String(error));
          receiveSpan.error(errorObj);
          self.emit(`${ streamId }-error`, errorObj);
        });

        stream.on("end", () => {
          self.emit(`${ streamId }-end`);
          receiveSpan.end();
        });

        listener(receiveSpan.trace, null, stream);
      });

      resolve(streamId);
    });
  }

  async sendStream(
    trace: DTrace,
    event: string,
    streamId: string,
    stream: Readable,
  ): Promise<void> {
    // Create span for sending stream
    const sendSpan = this.metrics.createSpan(trace, "sendStream:send", {
      event,
      streamId
    });

    this.log.debug(sendSpan.trace, "sendStream: emitting _self-{streamId}", { streamId });

    const self = this;
    return new Promise((resolve, rejectI) => {
      const timeout = Number.parseInt(streamId.split("=")[1]);

      const clearSessions = (e?: Error) => {
        stream.destroy(e);
        if (receiptTimeoutHandler !== null) {
          clearTimeout(receiptTimeoutHandler);
        }
        receiptTimeoutHandler = null;
        clearTimeout(timeoutHandler);
        self.removeAllListeners(`${ streamId }-emit`);
        self.removeAllListeners(`${ streamId }-end`);
        self.removeAllListeners(`${ streamId }-error`);
        sendSpan.end();
      };

      const reject = (e: Error) => {
        clearSessions(e);
        sendSpan.error(e);
        rejectI(e);
      };

      let receiptTimeoutHandler: NodeJS.Timeout | null = setTimeout(() => {
        const timeoutError = new BSBError(sendSpan.trace, "Send Receipt Timeout");
        reject(timeoutError);
      }, self.staticCommsTimeout);

      const timeoutHandler = setTimeout(() => {
        const timeoutError = new BSBError(sendSpan.trace, "Stream Timeout");
        reject(timeoutError);
      }, timeout * 1000);

      self.once(`${ streamId }-emit`, () => {
        if (receiptTimeoutHandler !== null) {
          clearTimeout(receiptTimeoutHandler);
        }
        receiptTimeoutHandler = null;
      });

      self.once(`${ streamId }-end`, () => {
        clearSessions();
        resolve();
      });

      self.once(`${ streamId }-error`, (error: Error) => reject(error));

      self.emit(streamId, sendSpan.trace, stream);
    });
  }
}
