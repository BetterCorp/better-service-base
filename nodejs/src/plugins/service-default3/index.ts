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

import { z } from "zod";
import {
  BSBPluginConfig,
  BSBPluginEvents,
  ServiceEventsBase,
} from "../../index";
import { BSBService, BSBServiceConstructor } from "../../base/BSBService";
import { DTrace } from "../../interfaces/metrics";

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
  emitReturnableEvents: {
    calculate: (a: number, b: number) => Promise<number>;
  };
  onBroadcast: ServiceEventsBase;
  emitBroadcast: ServiceEventsBase;
}

export class Plugin
  extends BSBService<Config, ServiceTypes> {
  public static PLUGIN_CLIENT = { name: "service-default3" };
  public initBeforePlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public initAfterPlugins: string[] = ["service-default2"];

  dispose?(): void;

  constructor(config: BSBServiceConstructor) {
    super(config);
  }

  public async init(trace: DTrace) {
    this.log.info(trace, "Initializing service-default3");

    await this.events.onReturnableEvent(
      "onReverseReturnable",
      trace,
      async (iTrace: DTrace, tex: string) => {
        this.log.warn(iTrace, "onReverseReturnable ({tex})", { tex });
        return tex.split("").reverse().join("");
      },
    );
  }

  public async run(trace: DTrace) {
    this.log.info(trace, "Running service-default3");

    // Use events to calculate
    // const result = await this.events.emitEventAndReturn(
    //   "calculate",
    //   trace,
    //   5,
    //   18,
    //   19
    // );

    // this.log.info(trace, "Calculation result: {result}", { result });
    this.log.debug(trace, "Debug {a}", { a: "IT IS AN DEBUG!" });
    this.log.info(trace, "Info {a}", { a: "IT IS AN INFO!" });
    this.log.warn(trace, "Warning {a}", { a: "IT IS AN WARNING!" });
    this.log.error(trace, "Error {a}", { a: "IT IS AN ERROR!" });
  }
}
