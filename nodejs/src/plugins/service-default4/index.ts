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

import { Observable } from "../../index";
import { BSBService, BSBServiceConstructor, createConfigSchema, bsb } from "../../base";
import { createEventSchemas, createReturnableEvent } from "../../interfaces/schema-events";
import { z } from "zod";

export const Config = createConfigSchema(
  {
    name: 'service-default4',
    description: 'Default service plugin 4 for testing',
    version: '1.0.0',
    image: '../docs/public/assets/images/bsb-logo.png',
    tags: ['default', 'example', 'test'],
  },
  z.null()
);

export const EventSchemas = createEventSchemas({
  emitReturnableEvents: {
    onReverseReturnable: createReturnableEvent(
      bsb.object({
        text: bsb.string({ description: 'Text to reverse' })
      }, 'Reverse input parameters'),
      bsb.string({ description: 'Reversed text' }),
      'Reverse text string'
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
  public override initAfterPlugins: string[] = [];

  dispose?(): void;
  init?(): void | Promise<void>;

  constructor(config: BSBServiceConstructor<InstanceType<typeof Config>, typeof EventSchemas>) {
    super(config);
  }

  public override async run(obs: Observable) {
    obs.log.info("Running service-default4");
  }
}
