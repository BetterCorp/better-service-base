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
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { BSBError, Observable, IPluginLogging } from "../../../index.js";

export class emitStreamAndReceiveStream
  extends EventEmitter {
  // If we try receive or send a stream and the other party is not ready for some reason, we will automatically timeout in 5s.
  private readonly staticCommsTimeout = 1000;

  constructor(_log: IPluginLogging) {
    super();
  }

  public dispose() {
    this.removeAllListeners();
  }

  async receiveStream(
    obs: Observable,
    pluginName: string,
    event: string,
    listener: { (eobs: Observable, error: Error | null, stream: Readable): Promise<void> },
    timeoutSeconds: number = 60,
  ): Promise<string> {
    // Create child observable for receiving stream
    const receiveObs = obs.startSpan("receiveStream:receive", {
      event,
      pluginName,
      timeoutSeconds,
    });

    const streamId = `${randomUUID()}=${timeoutSeconds}`;
    receiveObs.log.debug("receiveStream: listening to {streamId} ({pluginName}-{event})", {
      streamId,
      pluginName,
      event,
    });

    const self = this;
    return new Promise((resolve) => {
      const receiptTimeoutHandler: NodeJS.Timeout = setTimeout(() => {
        const timeoutError = new BSBError(receiveObs.trace, "Receive Receipt Timeout");
        receiveObs.error(timeoutError);
        listener(receiveObs, timeoutError, null!);
        self.emit(`${streamId}-error`, receiveObs, timeoutError);
        self.removeAllListeners(streamId);
        receiveObs.end();
      }, self.staticCommsTimeout);

      self.once(streamId, (eobs: Observable, stream: Readable): void => {
        clearTimeout(receiptTimeoutHandler);
        self.emit(`${streamId}-emit`);

        stream.on("error", (error: any) => {
          const errorObj = error instanceof Error ? error : new Error(error?.message || String(error));
          receiveObs.error(errorObj);
          self.emit(`${streamId}-error`, errorObj);
        });

        stream.on("end", () => {
          self.emit(`${streamId}-end`);
          receiveObs.end();
        });

        listener(receiveObs, null, stream);
      });

      resolve(streamId);
    });
  }

  async sendStream(
    obs: Observable,
    pluginName: string,
    event: string,
    streamId: string,
    stream: Readable,
  ): Promise<void> {
    // Create child observable for sending stream
    const sendObs = obs.startSpan("sendStream:send", {
      event,
      pluginName,
      streamId
    });

    sendObs.log.debug("sendStream: emitting {streamId}", { streamId });

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
        self.removeAllListeners(`${streamId}-emit`);
        self.removeAllListeners(`${streamId}-end`);
        self.removeAllListeners(`${streamId}-error`);
        sendObs.end();
      };

      const reject = (e: Error) => {
        clearSessions(e);
        sendObs.error(e);
        rejectI(e);
      };

      let receiptTimeoutHandler: NodeJS.Timeout | null = setTimeout(() => {
        const timeoutError = new BSBError(sendObs.trace, "Send Receipt Timeout");
        reject(timeoutError);
      }, self.staticCommsTimeout);

      const timeoutHandler = setTimeout(() => {
        const timeoutError = new BSBError(sendObs.trace, "Stream Timeout");
        reject(timeoutError);
      }, timeout * 1000);

      self.once(`${streamId}-emit`, () => {
        if (receiptTimeoutHandler !== null) {
          clearTimeout(receiptTimeoutHandler);
        }
        receiptTimeoutHandler = null;
      });

      self.once(`${streamId}-end`, () => {
        clearSessions();
        resolve();
      });

      self.once(`${streamId}-error`, (error: Error) => reject(error));

      self.emit(streamId, sendObs, stream);
    });
  }
}
