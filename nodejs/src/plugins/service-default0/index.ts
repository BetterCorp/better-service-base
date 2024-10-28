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

import {BSBPluginConfig, BSBService, BSBServiceConstructor, ServiceClient} from "../../base";
import {Plugin as Default1Plugin} from "../../plugins/service-default1/index";
import {z} from "zod";
import {BSBServiceClientDefinition} from "../../base";

export const secSchema = z.object({
  testa: z.number(),
  testb: z.number(),
});

export class Config
    extends BSBPluginConfig<typeof secSchema> {
  validationSchema = secSchema;

  migrate(
      toVersion: string,
      fromVersion: string | null,
      fromConfig: any | null,
  ) {
    if (fromConfig === null) {
      // defaults
      return {
        testa: 1,
        testb: 2,
      };
    }
    else {
      // migrate
      return {
        testa: fromConfig.testa,
        testb: fromConfig.testb,
      };
    }
  }
}

export interface Events {
  emitEvents: {
    test: (a: string, b: string) => Promise<void>;
  };
  onEvents: {};
  emitReturnableEvents: {};
  onReturnableEvents: {};
  emitBroadcast: {};
  onBroadcast: {};
}

export class Plugin
    extends BSBService<Config, Events> {
  public static PLUGIN_CLIENT: BSBServiceClientDefinition = {
    name: "service-default0",
  }
  public initBeforePlugins?: string[] | undefined;
  //public initAfterPlugins: string[] = ["service-default3"];
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  public init?(): Promise<void>;

  public dispose?(): void;

  public readonly methods = {
    abc: async (traceId: string, ...numbers: Array<number>) => {
      this.log.info("abc called: {numbers}", {numbers});
    },
  };
  private testClient: ServiceClient<Default1Plugin>;

  constructor(config: BSBServiceConstructor) {
    super(config);
    this.testClient = new ServiceClient(Default1Plugin, this);
  }

  public async run() {
    const traceId = this.metrics.createTrace().id;
    this.log.info("aa");
    this.events.emitEvent("test", traceId, "test", "test");
    await this.testClient.callMethod('callableMethod',
        traceId,
        this.config.testa,
        this.config.testb,
    );

    setTimeout(() => {
      const trace = this.metrics.createTrace();
      const span = trace.createSpan("test-span");
      console.log("abc called");
      span.end();
      trace.end();
      console.log(trace);
    }, 5000);
  }
}
