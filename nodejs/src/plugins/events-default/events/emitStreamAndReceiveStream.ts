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
import {Readable} from "node:stream";
import {randomUUID} from "node:crypto";
import {IPluginLogger} from "../../../index";

export class emitStreamAndReceiveStream
    extends EventEmitter {
  // If we try receive or send a stream and the other party is not ready for some reason, we will automatically timeout in 5s.
  private readonly staticCommsTimeout = 1000;
  private log: IPluginLogger;

  constructor(log: IPluginLogger) {
    super();
    this.log = log;
  }

  public dispose() {
    this.removeAllListeners();
  }

  async receiveStream(
      event: string,
      listener: { (error: Error | null, stream: Readable): Promise<void> },
      timeoutSeconds: number = 60,
  ): Promise<string> {
    const streamId = `${randomUUID()}=${timeoutSeconds}`;
    this.log.debug("receiveStream: listening to {streamId}", {
      streamId,
    });
    const self = this;
    return new Promise((resolve) => {
      const receiptTimeoutHandler: NodeJS.Timeout = setTimeout(() => {
        const err = new Error("Receive Receipt Timeout");
        listener(err, null!);
        self.emit(`${streamId}-error`, err);
        self.removeAllListeners(streamId);
      }, self.staticCommsTimeout);
      self.once(streamId, (stream: Readable): void => {
        clearTimeout(receiptTimeoutHandler);
        self.emit(`${streamId}-emit`);
        stream.on("error", (e) => {
          self.emit(`${streamId}-error`, e);
        });
        stream.on("end", () => {
          self.emit(`${streamId}-end`);
        });
        listener(null, stream);
      });
      resolve(streamId);
    });
  }

  async sendStream(
      event: string,
      streamId: string,
      stream: Readable,
  ): Promise<void> {
    const self = this;
    this.log.debug("sendStream: emitting _self-{streamId}", {streamId});
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
      };
      const reject = (e: Error) => {
        clearSessions(e);
        rejectI(e);
      };
      let receiptTimeoutHandler: NodeJS.Timeout | null = setTimeout(() => {
        reject(new Error("Send Receipt Timeout"));
      }, self.staticCommsTimeout);
      const timeoutHandler = setTimeout(() => {
        reject(new Error("Stream Timeout"));
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
      self.once(`${streamId}-error`, (e: Error) => reject(e));
      self.emit(streamId, stream);
    });
  }
}
