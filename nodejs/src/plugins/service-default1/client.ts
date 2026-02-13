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

import { BSBServiceClient } from "../..";
import { Plugin } from ".";
import { Observable } from "../../interfaces";

export class testClient extends BSBServiceClient<Plugin> {
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public dispose?(): void;
  public run?(): Promise<void>;
  public readonly pluginName: string = "service-default1";
  private count = 0;
  private initObs?: Observable;

  public async init(obs: Observable): Promise<void> {
    this.initObs = obs;
    // Handle emittable events
    this.events.onEvent("onEmittable", obs, async (obs: Observable, input: any) => {
      obs.log.warn( "onEmittable ({a},{b})", { a: input.a, b: input.b });
    });

    // Handle returnable events
    this.events.onReturnableEvent("onReverseReturnable", obs, async (obs: Observable, input: any) => {
      this.count++;
      obs.log.warn( "onReverseReturnable ({a},{b})", { a: input.a, b: input.b });
      return input.a * input.b;
    });

    // Emit receivable event
    await this.events.emitEvent("onReceivable", obs, { a: 56, b: 7 });
  }

  async abc(a: number, b: number, c: number, d: number): Promise<void> {
    const obs = this.initObs!.startSpan('abc', { component: 'test' });

    try {
      const result = await this.events.emitEventAndReturn("onReturnable", obs, { a: c, b: d }, 5);
      obs.log.warn("TESTING onReturnable ({result})", { result });
    } catch (error) {
      obs.error(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      obs.end();
    }
  }
}
