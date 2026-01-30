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

import { BSBPluginConfig, BSBService, BSBServiceConstructor } from "../../base";
import { z } from "zod";
import { BSBServiceClientDefinition } from "../../base";
import { Observable } from "../../interfaces/observable";
import { createFireAndForgetEvent, createReturnableEvent, createBroadcastEvent } from "../../interfaces/schema-events";

export const secSchema = z.object({
  testa: z.number(),
  testb: z.number(),
});

export class Config
  extends BSBPluginConfig<typeof secSchema> {
  validationSchema = secSchema;
}

export const EventSchemas = {
  // Events this service emits (fire-and-forget, first listener receives)
  emitEvents: {
    test: createFireAndForgetEvent(
      z.object({
        a: z.string(),
        b: z.string()
      }),
      'Test event with string parameters'
    )
  },
  
  // Events this service listens to (fire-and-forget)
  onEvents: {
    startup: createFireAndForgetEvent(
      z.object({
        timestamp: z.string().datetime(),
        source: z.string()
      }),
      'Handle system startup notification'
    )
  },
  
  // Returnable events this service emits (requests from this service)
  emitReturnableEvents: {
    calculate: createReturnableEvent(
      z.object({
        a: z.number().min(0),
        b: z.number().min(0)
      }),
      z.number(),
      'Calculate with two numbers'
    )
  },
  
  // Returnable events this service listens to (requests to this service)
  onReturnableEvents: {
    'data.validate': createReturnableEvent(
      z.object({
        data: z.unknown(),
        schema: z.string()
      }),
      z.object({
        valid: z.boolean(),
        errors: z.array(z.string())
      }),
      'Validate data against a schema'
    )
  },
  
  // Broadcast events this service emits (all listeners receive)
  emitBroadcast: {
    'system.alert': createBroadcastEvent(
      z.object({
        level: z.enum(['info', 'warning', 'error', 'critical']),
        message: z.string(),
        timestamp: z.string().datetime(),
        source: z.string()
      }),
      'System-wide alert broadcast'
    )
  },
  
  // Broadcast events this service listens to
  onBroadcast: {
    'system.shutdown': createBroadcastEvent(
      z.object({
        reason: z.string(),
        gracefulTimeout: z.number().default(30000)
      }),
      'Listen for system shutdown broadcasts'
    )
  }
} as const; // Critical for type safety

export class Plugin
  extends BSBService<Config, typeof EventSchemas> {
  public static PLUGIN_CLIENT: BSBServiceClientDefinition = {
    name: "service-default0",
  }
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  public init?(): Promise<void>;
  public dispose?(): void;

  constructor(config: BSBServiceConstructor<Config, typeof EventSchemas>) {
    super({
      ...config,
      eventSchemas: EventSchemas
    });
  }

  public async run(obs: Observable) {
    // v9: Observable provides unified logging, metrics, and tracing
    obs.log.info("Starting service-default0");

    // Event methods accept Observable directly (no need to extract .trace)
    await this.events.emitEvent("test", obs, {
      a: "test",
      b: "test"
    });

    // Calculate using returnable event with Observable
    const result = await this.events.emitEventAndReturn(
      "calculate",
      obs,
      {
        a: this.config.testa,
        b: this.config.testb
      },
      5 // timeout seconds
    );

    obs.log.info("Calculation result: {result}", { result });
  }
}
