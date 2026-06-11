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

import { BSBService, BSBServiceConstructor } from "../../base/BSBService.js";
import { ServiceClient, createConfigSchema, bsb, optional } from "../../base/index.js";
import { Observable } from "../../interfaces/observable.js";
import { createFireAndForgetEvent, createReturnableEvent, createBroadcastEvent, createEventSchemas } from "../../interfaces/schema-events.js";
import { Plugin as Service0, EventSchemas as Service0EventSchemas } from "../service-default0/index.js";
import * as av from "anyvali";

// v9: Config with metadata (no configuration options for this service)
export const Config = createConfigSchema(
  {
    name: 'service-default1',
    description: 'Default service demonstrating BSB event patterns',
    image: '../docs/public/assets/images/bsb-logo.png',
    tags: ['default', 'example'],
  },
  av.optional(av.object({}, { unknownKeys: "strip" }).describe("Default service 1 configuration")).default({})
    .describe("Optional default service 1 configuration")
);

export const EventSchemas = createEventSchemas({
  // Events this service emits (fire-and-forget, first listener receives)
  emitEvents: {
    'data.processed': createFireAndForgetEvent(
      bsb.object({
        itemId: bsb.string({ description: 'Processed item ID' }),
        result: bsb.unknown('Processing result'),
        processingTime: bsb.number({ description: 'Processing time in milliseconds' })
      }, 'Data processing result'),
      'Emitted when data processing is complete'
    )
  },

  // Events this service listens to (fire-and-forget)
  onEvents: {
    'data.received': createFireAndForgetEvent(
      bsb.object({
        itemId: bsb.string({ description: 'Received item ID' }),
        data: bsb.unknown('Data payload'),
        source: bsb.string({ description: 'Data source' })
      }, 'Received data parameters'),
      'Handle incoming data for processing'
    )
  },

  // Returnable events this service emits (requests from this service)
  emitReturnableEvents: {
    'calculation.request': createReturnableEvent(
      bsb.object({
        operation: bsb.enum(['add', 'subtract', 'multiply', 'divide'], 'Calculation operation'),
        operands: bsb.array(bsb.number({ description: 'Operand' }), { min: 2, description: 'List of operands' })
      }, 'Calculation request parameters'),
      bsb.number({ description: 'Calculation result' }),
      'Request calculation from external service'
    )
  },

  // Returnable events this service listens to (requests to this service)
  onReturnableEvents: {
    'text.transform': createReturnableEvent(
      bsb.object({
        text: bsb.string({ description: 'Text to transform' }),
        transformation: bsb.enum(['uppercase', 'lowercase', 'reverse', 'capitalize'], 'Transformation type')
      }, 'Text transformation parameters'),
      bsb.string({ description: 'Transformed text' }),
      'Transform text according to specified operation'
    ),
    calculate: createReturnableEvent(
      bsb.object({
        a: bsb.number({ description: 'First number' }),
        b: bsb.number({ description: 'Second number' })
      }, 'Calculation parameters'),
      bsb.number({ description: 'Calculation result' }),
      'Calculate with two numbers'
    )
  },

  // Broadcast events this service emits (all listeners receive)
  emitBroadcast: {
    'service.status': createBroadcastEvent(
      bsb.object({
        status: bsb.enum(['starting', 'ready', 'busy', 'stopping'], 'Service status'),
        timestamp: bsb.datetime('Status timestamp'),
        details: optional(bsb.string({ description: 'Status details' }))
      }, 'Service status parameters'),
      'Broadcast service status updates'
    )
  },

  // Broadcast events this service listens to
  onBroadcast: {
    'config.updated': createBroadcastEvent(
      bsb.object({
        section: bsb.string({ description: 'Configuration section' }),
        changes: bsb.record(bsb.string({ description: 'Setting name' }), bsb.unknown('Setting value'), 'Configuration changes'),
        version: bsb.string({ description: 'Configuration version' })
      }, 'Config update parameters'),
      'Listen for configuration update broadcasts'
    )
  }
});

export class Plugin
  extends BSBService<InstanceType<typeof Config>, typeof EventSchemas> {
  // v9: Required static properties for auto-generation
  static Config = Config;
  static EventSchemas = EventSchemas;
  // PLUGIN_CLIENT is now auto-generated from Config.metadata

  private service0: ServiceClient<Service0, typeof Service0EventSchemas, typeof Service0>;

  constructor(config: BSBServiceConstructor<InstanceType<typeof Config>, typeof EventSchemas>) {
    super({
      ...config,
      eventSchemas: EventSchemas
    });
    this.service0 = new ServiceClient<Service0>(Service0, this);
  }

  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  dispose?(): void;
  run?(): void | Promise<void>;

  public async init(obs: Observable) {
    // v9: Observable provides unified logging, metrics, and tracing
    obs.log.info("Initializing service-default1");

    // Listen to service0's calculation events (service0 emits these)
    // Event handlers receive Observable (not DTrace) with automatic context
    await this.service0.events.onReturnableEvent("calculate", obs, async (handlerObs: Observable, input) => {
      // handlerObs is a child span created automatically by BSB
      handlerObs.log.info("Handling calculation request from service0: {a} * {b}", {
        a: input.a,
        b: input.b
      });
      return input.a * input.b;
    });

    // Handle text transformation requests
    // Demonstrates Observable usage in event handlers
    await this.events.onReturnableEvent("text.transform", obs, async (handlerObs: Observable, input) => {
      handlerObs.log.info("Transforming text: {text} using {transformation}", {
        text: input.text,
        transformation: input.transformation
      });

      // Can create child spans for sub-operations
      const workObs = handlerObs.startSpan("transform-operation");
      workObs.setAttribute("operation", input.transformation);

      let result: string;
      switch (input.transformation) {
        case 'uppercase':
          result = input.text.toUpperCase();
          break;
        case 'lowercase':
          result = input.text.toLowerCase();
          break;
        case 'reverse':
          result = input.text.split('').reverse().join('');
          break;
        case 'capitalize':
          result = input.text.charAt(0).toUpperCase() + input.text.slice(1).toLowerCase();
          break;
        default:
          result = input.text;
          break;
      }

      workObs.end({ "result.length": result.length });
      return result;
    });

    // Handle calculation requests
    await this.events.onReturnableEvent("calculate", obs, async (handlerObs: Observable, input) => {
      handlerObs.log.info("Calculating {a} * {b}", { a: input.a, b: input.b });
      return input.a * input.b;
    });

    // Handle incoming data for processing
    await this.events.onEvent("data.received", obs, async (handlerObs: Observable, input) => {
      handlerObs.log.info("Received data for processing: {itemId}", { itemId: input.itemId });

      // Process the data and emit completion event
      await this.events.emitEvent("data.processed", obs, {
        itemId: input.itemId,
        result: { processed: true, timestamp: new Date().toISOString() },
        processingTime: 100
      });
    });

    // Listen for configuration update broadcasts
    await this.events.onBroadcast("config.updated", obs, async (handlerObs: Observable, input) => {
      handlerObs.log.info("Configuration updated: {section}", { section: input.section });
      // Handle configuration changes...
    });
  }
}
