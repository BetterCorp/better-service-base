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

import * as av from "@anyvali/js";
import { BSBService, BSBServiceConstructor, createConfigSchema, bsb } from "../../base/index.js";
import { Observable } from "../../interfaces/index.js";
import { createEventSchemas, createReturnableEvent } from "../../interfaces/schema-events.js";

export const Config = createConfigSchema(
  {
    name: 'service-default3',
    description: 'Default service plugin 3 for testing',
    image: '../docs/public/assets/images/bsb-logo.png',
    tags: ['default', 'example', 'test'],
    initAfterPlugins: ['service-default2'],
  },
  av.optional(av.object({}, { unknownKeys: "strip" })).default({})
);

export const EventSchemas = createEventSchemas({
  onReturnableEvents: {
    onReverseReturnable: createReturnableEvent(
      bsb.object({
        text: bsb.string({ description: 'Text to reverse' })
      }, 'Reverse input parameters'),
      bsb.string({ description: 'Reversed text' }),
      'Reverse a string'
    )
  },
  emitReturnableEvents: {
    calculate: createReturnableEvent(
      bsb.object({
        a: bsb.number({ description: 'First number' }),
        b: bsb.number({ description: 'Second number' })
      }, 'Calculate input parameters'),
      bsb.number({ description: 'Calculation result' }),
      'Calculate with two numbers'
    )
  }
});

export class Plugin extends BSBService<InstanceType<typeof Config>, typeof EventSchemas> {
  static Config = Config;
  static EventSchemas = EventSchemas;
  // PLUGIN_CLIENT auto-generated from Config.metadata

  public initBeforePlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public initAfterPlugins: string[] = ["service-default2"];

  dispose?(): void;

  constructor(config: BSBServiceConstructor<InstanceType<typeof Config>, typeof EventSchemas>) {
    super(config);
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
