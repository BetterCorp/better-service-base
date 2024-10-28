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

import {BSBService, BSBPluginEvents} from "../../index";
import {BSBServiceClientDefinition} from "../../base";

export interface Events
    extends BSBPluginEvents {
  emitEvents: {
    onEmittable(a: number, b: number): Promise<void>;
  };
  onEvents: {
    onReceivable(a: number, b: number): Promise<void>;
  };
  emitReturnableEvents: {
    onReverseReturnable(a: number, b: number): Promise<number>;
  };
  onReturnableEvents: {
    onReturnable(a: number, b: number): Promise<number>;
  };
  emitBroadcast: {};
  onBroadcast: {};
}

export class Plugin
    extends BSBService<null, Events> {
  public static PLUGIN_CLIENT: BSBServiceClientDefinition = {
    name: "service-default1",
  }
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public methods = {
    callableMethod: async (traceId: string, a: number, b: number) => {
      this.log.warn("callableMethod ({a},{b})", {a, b});
      this.events.emitEvent("onEmittable", traceId, a, b);
      return a * b;
    },
    testMethod: (): boolean => {
      return true;
    },
  };

  dispose?(): void;

  run?(): void | Promise<void>;

  public async init() {
    this.log.info("INIT SERVICE");
    this.events.onEvent("onReceivable", async (traceId: string, a: number, b: number) => {
      this.log.warn("received onReceivable ({a},{b}", {a, b});
      //process.exit(3);
    });
    this.events.onReturnableEvent(
        "onReturnable",
        async (traceId: string, a: number, b: number) => {
          this.log.warn("RECEIVED onReturnable ({a},{b})", {a, b});
          const result = await this.events.emitEventAndReturn(
              "onReverseReturnable",
              traceId,
              5,
              a,
              b,
          );
          this.log.warn("RETURNED onReverseReturnable ({result})", {
            result,
          });
          return result;
        },
    );
  }
}
