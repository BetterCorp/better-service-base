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

import {Readable} from "node:stream";
import {
  emit,
  broadcast,
  emitAndReturn,
  emitStreamAndReceiveStream,
} from "../../plugins/events-default/events/index";
import {BSBEvents, BSBEventsConstructor} from "../../index";

export class Plugin
    extends BSBEvents {
  init?(): void;

  protected broadcast!: broadcast;
  protected emit!: emit;
  protected ear!: emitAndReturn;
  protected eas!: emitStreamAndReceiveStream;

  constructor(config: BSBEventsConstructor) {
    super(config);

    this.broadcast = new broadcast(this.createNewLogger("broadcast"));
    this.emit = new emit(this.createNewLogger("emit"));
    this.ear = new emitAndReturn(this.createNewLogger("emitAndReturn"));
    this.eas = new emitStreamAndReceiveStream(this.createNewLogger("stream"));
  }

  public dispose() {
    this.broadcast.dispose();
    this.emit.dispose();
    this.ear.dispose();
    this.eas.dispose();
  }

  public async onBroadcast(
      pluginName: string,
      event: string,
      listener: { (traceId: string, args: Array<any>): Promise<void> },
  ): Promise<void> {
    await this.broadcast.onBroadcast(pluginName, event, listener);
  }

  public async emitBroadcast(
      pluginName: string,
      event: string,
      traceId: string,
      args: Array<any>,
  ): Promise<void> {
    await this.broadcast.emitBroadcast(pluginName, event, traceId, args);
  }

  public async onEvent(
      pluginName: string,
      event: string,
      listener: { (traceId: string, args: Array<any>): Promise<void> },
  ): Promise<void> {
    await this.emit.onEvent(pluginName, event, listener);
  }

  public async emitEvent(
      pluginName: string,
      event: string,
      traceId: string,
      args: Array<any>,
  ): Promise<void> {
    await this.emit.emitEvent(pluginName, event, traceId, args);
  }

  public async onReturnableEvent(
      pluginName: string,
      event: string,
      listener: { (traceId: string, args: Array<any>): Promise<any> },
  ): Promise<void> {
    await this.ear.onReturnableEvent(pluginName, event, listener);
  }

  public async emitEventAndReturn(
      pluginName: string,
      event: string,
      traceId: string,
      timeoutSeconds: number,
      args: Array<any>,
  ): Promise<any> {
    return await this.ear.emitEventAndReturn(
        pluginName,
        event,
        traceId,
        timeoutSeconds,
        args,
    );
  }

  public async receiveStream(
      event: string,
      listener: { (error: Error | null, stream: Readable): Promise<void> },
      timeoutSeconds?: number,
  ): Promise<string> {
    return this.eas.receiveStream(event, listener, timeoutSeconds);
  }

  public async sendStream(
      event: string,
      streamId: string,
      stream: Readable,
  ): Promise<void> {
    return this.eas.sendStream(event, streamId, stream);
  }
}
