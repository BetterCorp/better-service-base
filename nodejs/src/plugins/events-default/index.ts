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

import { Readable } from "node:stream";
import {
  emit,
  broadcast,
  emitAndReturn,
  emitStreamAndReceiveStream,
} from "../../plugins/events-default/events/index";
import { Observable } from "../../index";
import { BSBEvents, BSBEventsConstructor } from "../../base/BSBEvents";
import { createConfigSchema } from "../../base/PluginConfig";

export const Config = createConfigSchema(
  {
    name: "events-default",
    description: "Default in-process events plugin for BSB event routing",
    version: "1.0.0",
    image: "../docs/public/assets/images/bsb-logo.png",
    tags: ["core", "events", "default"],
    documentation: [
      "./docs/core-plugins/events-default.md",
      "./docs/core-plugins/events-default-patterns.md",
    ],
  }
);

export class Plugin
  extends BSBEvents<InstanceType<typeof Config>> {
  static Config = Config;
  init?(): void;

  protected broadcast!: broadcast;
  protected emit!: emit;
  protected ear!: emitAndReturn;
  protected eas!: emitStreamAndReceiveStream;

  constructor(config: BSBEventsConstructor<InstanceType<typeof Config>>) {
    super(config);

    this.broadcast = new broadcast(this.__internalObservable);
    this.emit = new emit(this.__internalObservable);
    this.ear = new emitAndReturn(this.__internalObservable);
    this.eas = new emitStreamAndReceiveStream(this.__internalObservable);
  }

  public dispose() {
    this.broadcast.dispose();
    this.emit.dispose();
    this.ear.dispose();
    this.eas.dispose();
  }

  public async onBroadcast(
    obs: Observable,
    pluginName: string,
    event: string,
    listener: { (obs: Observable, args: Array<any>): Promise<void> },
  ): Promise<void> {
    await this.broadcast.onBroadcast(obs, pluginName, event, listener);
  }

  public async emitBroadcast(
    obs: Observable,
    pluginName: string,
    event: string,
    args: Array<any>,
  ): Promise<void> {
    await this.broadcast.emitBroadcast(obs, pluginName, event, args);
  }

  public async onEvent(
    obs: Observable,
    pluginName: string,
    event: string,
    listener: { (obs: Observable, args: Array<any>): Promise<void> },
  ): Promise<void> {
    await this.emit.onEvent(obs, pluginName, event, listener);
  }

  public async emitEvent(
    obs: Observable,
    pluginName: string,
    event: string,
    args: Array<any>,
  ): Promise<void> {
    await this.emit.emitEvent(obs, pluginName, event, args);
  }

  public async onReturnableEvent(
    obs: Observable,
    pluginName: string,
    event: string,
    listener: { (obs: Observable, args: Array<any>): Promise<any> },
  ): Promise<void> {
    await this.ear.onReturnableEvent(obs, pluginName, event, listener);
  }

  public async emitEventAndReturn(
    obs: Observable,
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    args: Array<any>,
  ): Promise<any> {
    return await this.ear.emitEventAndReturn(
      obs,
      pluginName,
      event,
      timeoutSeconds,
      args,
    );
  }

  public async receiveStream(
    obs: Observable,
    pluginName: string,
    event: string,
    listener: { (obs: Observable, error: Error | null, stream: Readable): Promise<void> },
    timeoutSeconds?: number,
  ): Promise<string> {
    return this.eas.receiveStream(obs, pluginName, event, listener, timeoutSeconds);
  }

  public async sendStream(
    obs: Observable,
    pluginName: string,
    event: string,
    streamId: string,
    stream: Readable,
  ): Promise<void> {
    return this.eas.sendStream(obs, pluginName, event, streamId, stream);
  }
}
