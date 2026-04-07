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

import { BSBService, BSBServiceConstructor, createConfigSchema, bsb } from "../../base/index.js";
import * as av from "@anyvali/js";
import { createEventSchemas, createFireAndForgetEvent, createReturnableEvent, createBroadcastEvent } from "../../interfaces/schema-events.js";
import { Observable } from "../../interfaces/observable.js";

const secSchema = av.object({
  testa: av.number(),
  testb: av.number(),
}, { unknownKeys: "strip" });

export const Config = createConfigSchema(
  {
    name: 'service-default0',
    description: 'Default service plugin 0 for testing',
    image: '../docs/public/assets/images/bsb-logo.png',
    tags: ['default', 'example', 'test'],
  },
  secSchema
);

export const EventSchemas = createEventSchemas({
  // Events this service emits (fire-and-forget, first listener receives)
  emitEvents: {
    test: createFireAndForgetEvent(
      bsb.object({
        a: bsb.string({ description: 'First string parameter' }),
        b: bsb.string({ description: 'Second string parameter' })
      }, 'Test event parameters'),
      'Test event with string parameters'
    )
  },

  // Events this service listens to (fire-and-forget)
  onEvents: {
    startup: createFireAndForgetEvent(
      bsb.object({
        timestamp: bsb.datetime('Startup timestamp'),
        source: bsb.string({ description: 'Source identifier' })
      }, 'Startup event parameters'),
      'Handle system startup notification'
    )
  },

  // Returnable events this service emits (requests from this service)
  emitReturnableEvents: {
    calculate: createReturnableEvent(
      bsb.object({
        a: bsb.number({ min: 0, description: 'First number' }),
        b: bsb.number({ min: 0, description: 'Second number' })
      }, 'Calculate input parameters'),
      bsb.number({ description: 'Calculation result' }),
      'Calculate with two numbers'
    )
  },

  // Returnable events this service listens to (requests to this service)
  onReturnableEvents: {
    'data.validate': createReturnableEvent(
      bsb.object({
        data: bsb.unknown('Data to validate'),
        schema: bsb.string({ description: 'Schema name' })
      }, 'Validation input'),
      bsb.object({
        valid: bsb.boolean('Validation result'),
        errors: bsb.array(bsb.string({ description: 'Error message' }), { description: 'Validation errors' })
      }, 'Validation output'),
      'Validate data against a schema'
    )
  },

  // Broadcast events this service emits (all listeners receive)
  emitBroadcast: {
    'system.alert': createBroadcastEvent(
      bsb.object({
        level: bsb.enum(['info', 'warning', 'error', 'critical'], 'Alert level'),
        message: bsb.string({ description: 'Alert message' }),
        timestamp: bsb.datetime('Alert timestamp'),
        source: bsb.string({ description: 'Alert source' })
      }, 'System alert parameters'),
      'System-wide alert broadcast'
    )
  },

  // Broadcast events this service listens to
  onBroadcast: {
    'system.shutdown': createBroadcastEvent(
      bsb.object({
        reason: bsb.string({ description: 'Shutdown reason' }),
        gracefulTimeout: bsb.number({ description: 'Graceful timeout in milliseconds' })
      }, 'Shutdown parameters'),
      'Listen for system shutdown broadcasts'
    )
  }
});

export class Plugin extends BSBService<InstanceType<typeof Config>, typeof EventSchemas> {
  static Config = Config;
  static EventSchemas = EventSchemas;
  // PLUGIN_CLIENT auto-generated from Config.metadata

  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  dispose?(): void;
  init?(): void | Promise<void>;

  constructor(config: BSBServiceConstructor<InstanceType<typeof Config>, typeof EventSchemas>) {
    super(config);
  }

  public async run(obs: Observable) {
    obs.log.info("Starting service-default0");

    await this.events.emitEvent("test", obs, {
      a: "test",
      b: "test"
    });

    const result = await this.events.emitEventAndReturn(
      "calculate",
      obs,
      {
        a: this.config.testa,
        b: this.config.testb
      }
    );

    obs.log.info("Calculation result: {result}", { result });
  }
}
