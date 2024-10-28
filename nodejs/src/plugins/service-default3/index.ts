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

import {z} from "zod";
import {
  BSBPluginConfig,
  BSBPluginEvents,
  BSBService,
  BSBServiceConstructor, ServiceClient,
  ServiceEventsBase,
} from "../../index";
import {Plugin as Default0Plugin} from "../../plugins/service-default0/index";

export const secSchema = z.object({});

export class Config
    extends BSBPluginConfig<typeof secSchema> {
  validationSchema = secSchema;

  migrate(
      toVersion: string,
      fromVersion: string | null,
      fromConfig: any | null,
  ) {
    return fromConfig;
  }
}

export interface ServiceTypes
    extends BSBPluginEvents {
  onEvents: ServiceEventsBase;
  emitEvents: ServiceEventsBase;
  onReturnableEvents: {
    onReverseReturnable: (tex: string) => Promise<string>;
  };
  emitReturnableEvents: ServiceEventsBase;
  onBroadcast: ServiceEventsBase;
  emitBroadcast: ServiceEventsBase;
}

export class Plugin
    extends BSBService<Config, ServiceTypes> {
  public static PLUGIN_CLIENT = {name: "service-default3"};
  public initBeforePlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public methods = {
    testMethod: () => {
      this.log.info("TEST CALLABLE OK");
      return "test";
    },
  };

  dispose?(): void;

  public initAfterPlugins: string[] = ["service-default2"];
  private testClient: ServiceClient<Default0Plugin>;

  constructor(config: BSBServiceConstructor) {
    super(config);
    this.testClient = new ServiceClient<Default0Plugin>(Default0Plugin, this);
  }

  public async init() {
    await this.events.onReturnableEvent(
        "onReverseReturnable",
        async (traceId: string, tex: string) => {
          this.log.warn("onReverseReturnable ({tex})", {tex});
          return tex.split("")
                    .reverse()
                    .join("");
        },
    );
  }

  public async run() {
    const traceId = this.metrics.createTrace().id;
    await this.testClient.callMethod("abc", traceId, 18, 19, 20, 21);
    this.log.error("Error {a}", {a: "b"});
  }
}
