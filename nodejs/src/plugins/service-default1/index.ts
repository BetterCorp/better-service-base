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

import { BSBService } from "../../base/BSBService";
import { ServiceClient, BSBServiceClientDefinition } from "../../base";
import { DTrace } from "../../interfaces/metrics";
import { createFireAndForgetEvent, createReturnableEvent, createBroadcastEvent } from "../../interfaces/schema-events";
import { Plugin as Service0, EventSchemas as Service0EventSchemas } from "../service-default0";
import { z } from "zod";

export const EventSchemas = {
  // Events this service emits (fire-and-forget, first listener receives)
  emitEvents: {
    'data.processed': createFireAndForgetEvent(
      z.object({
        itemId: z.string(),
        result: z.unknown(),
        processingTime: z.number()
      }),
      'Emitted when data processing is complete'
    )
  },
  
  // Events this service listens to (fire-and-forget)
  onEvents: {
    'data.received': createFireAndForgetEvent(
      z.object({
        itemId: z.string(),
        data: z.unknown(),
        source: z.string()
      }),
      'Handle incoming data for processing'
    )
  },
  
  // Returnable events this service emits (requests from this service)
  emitReturnableEvents: {
    'calculation.request': createReturnableEvent(
      z.object({
        operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
        operands: z.array(z.number()).min(2)
      }),
      z.number(),
      'Request calculation from external service'
    )
  },
  
  // Returnable events this service listens to (requests to this service)
  onReturnableEvents: {
    'text.transform': createReturnableEvent(
      z.object({
        text: z.string(),
        transformation: z.enum(['uppercase', 'lowercase', 'reverse', 'capitalize'])
      }),
      z.string(),
      'Transform text according to specified operation'
    ),
    calculate: createReturnableEvent(
      z.object({
        a: z.number(),
        b: z.number()
      }),
      z.number(),
      'Calculate with two numbers'
    )
  },
  
  // Broadcast events this service emits (all listeners receive)
  emitBroadcast: {
    'service.status': createBroadcastEvent(
      z.object({
        status: z.enum(['starting', 'ready', 'busy', 'stopping']),
        timestamp: z.string().datetime(),
        details: z.string().optional()
      }),
      'Broadcast service status updates'
    )
  },
  
  // Broadcast events this service listens to
  onBroadcast: {
    'config.updated': createBroadcastEvent(
      z.object({
        section: z.string(),
        changes: z.record(z.unknown()),
        version: z.string()
      }),
      'Listen for configuration update broadcasts'
    )
  }
} as const;

export class Plugin
  extends BSBService<null, typeof EventSchemas> {
  
  private service0: ServiceClient<Service0, typeof Service0EventSchemas, typeof Service0>;

  constructor(config: any) {
    super({
      ...config,
      eventSchemas: EventSchemas
    });
    this.service0 = new ServiceClient<Service0>(Service0,this);
  }
  public static PLUGIN_CLIENT: BSBServiceClientDefinition = {
    name: "service-default1",
  }
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  dispose?(): void;
  run?(): void | Promise<void>;

  public async init(trace: DTrace) {
    this.log.info(trace, "Initializing service-default1");

    // Listen to service0's calculation events (service0 emits these)
    await this.service0.events.onReturnableEvent("calculate", trace, async (iTrace: DTrace, input) => {
      this.log.info(iTrace, "Handling calculation request from service0: {a} * {b}", { a: input.a, b: input.b });
      return input.a * input.b;
    });

    // This would cause a TypeScript error (uncomment to test):
    // await this.service0.events.emitEventAndReturn("invalid-event", trace, {}, 5);
    // TypeScript error: Argument of type '"invalid-event"' is not assignable to parameter

    // Handle text transformation requests
    await this.events.onReturnableEvent("text.transform", trace, async (iTrace: DTrace, input) => {
      this.log.info(iTrace, "Transforming text: {text} using {transformation}", { 
        text: input.text, 
        transformation: input.transformation 
      });
      
      switch (input.transformation) {
        case 'uppercase': return input.text.toUpperCase();
        case 'lowercase': return input.text.toLowerCase();
        case 'reverse': return input.text.split('').reverse().join('');
        case 'capitalize': return input.text.charAt(0).toUpperCase() + input.text.slice(1).toLowerCase();
        default: return input.text;
      }
    });

    // Handle calculation requests
    await this.events.onReturnableEvent("calculate", trace, async (iTrace: DTrace, input) => {
      this.log.info(iTrace, "Calculating {a} * {b}", { a: input.a, b: input.b });
      return input.a * input.b;
    });

    // Handle incoming data for processing
    await this.events.onEvent("data.received", trace, async (itrace: DTrace, input) => {
      this.log.info(itrace, "Received data for processing: {itemId}", { itemId: input.itemId });
      
      // Process the data and emit completion event
      await this.events.emitEvent("data.processed", trace, {
        itemId: input.itemId,
        result: { processed: true, timestamp: new Date().toISOString() },
        processingTime: 100
      });
    });

    // Listen for configuration update broadcasts
    await this.events.onBroadcast("config.updated", trace, async (iTrace: DTrace, input) => {
      this.log.info(iTrace, "Configuration updated: {section}", { section: input.section });
      // Handle configuration changes...
    });
  }
}
