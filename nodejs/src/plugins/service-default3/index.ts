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
} from "../../index";
import { BSBService, BSBServiceConstructor } from "../../base/BSBService";
import { Observable } from "../../interfaces";
import { createReturnableEvent } from "../../interfaces/schema-events";

export const secSchema = z.object({});

export class Config
  extends BSBPluginConfig<typeof secSchema> {
  validationSchema = secSchema;
}

export const EventSchemas = {
  onReturnableEvents: {
    onReverseReturnable: createReturnableEvent(
      z.object({
        text: z.string()
      }),
      z.string(),
      'Reverse a string'
    )
  },
  emitReturnableEvents: {
    calculate: createReturnableEvent(
      z.object({
        a: z.number(),
        b: z.number()
      }),
      z.number(),
      'Calculate with two numbers'
    )
  }
} as const;

export class Plugin
  extends BSBService<Config, typeof EventSchemas> {
  public static PLUGIN_CLIENT = { name: "service-default3" };
  public initBeforePlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public initAfterPlugins: string[] = ["service-default2"];

  dispose?(): void;

  constructor(config: BSBServiceConstructor<Config, typeof EventSchemas>) {
    super({
      ...config,
      eventSchemas: EventSchemas
    });
  }

  public async init(obs: Observable) {
    obs.log.info( "Initializing service-default3");

    await this.events.onReturnableEvent(
      "onReverseReturnable",
      obs,
      async (obs: Observable, input) => {
        obs.log.warn( "onReverseReturnable ({text})", { text: input.text });
        return input.text.split("").reverse().join("");
      },
    );
  }

  public async run(obs: Observable) {
    obs.log.info( "Running service-default3");

    // NEW API: Use events to calculate with object parameter
    const result = await this.events.emitEventAndReturn(
      "calculate",
      obs,
      {
        a: 18,
        b: 19
      },
      5 // timeout
    );

    obs.log.info( "Calculation result: {result}", { result });
    obs.log.debug( "Debug {a}", { a: "IT IS AN DEBUG!" });
    obs.log.info( "Info {a}", { a: "IT IS AN INFO!" });
    obs.log.warn( "Warning {a}", { a: "IT IS AN WARNING!" });
    obs.log.error( "Error {a}", { a: "IT IS AN ERROR!" });
  }
}
