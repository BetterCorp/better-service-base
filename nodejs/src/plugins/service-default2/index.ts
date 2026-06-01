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

import { Observable, ServiceClient } from "../../index.js";
import { BSBService, BSBServiceConstructor, createConfigSchema, bsb, optional } from "../../base/index.js";
import { Plugin as Service1, EventSchemas as Service1EventSchemas } from "../service-default1/index.js";
import { Plugin as Service3, EventSchemas as Service3EventSchemas } from "../service-default3/index.js";
import { createEventSchemas, createFireAndForgetEvent, createReturnableEvent, createBroadcastEvent } from "../../interfaces/schema-events.js";
import * as av from "anyvali";

export const Config = createConfigSchema(
  {
    name: 'service-default2',
    description: 'Default service plugin 2 for testing inter-service communication',
    image: '../docs/public/assets/images/bsb-logo.png',
    tags: ['default', 'example', 'test'],
  },
  av.optional(av.object({}, { unknownKeys: "strip" })).default({})
);

export const EventSchemas = createEventSchemas({
  // Events this service emits (fire-and-forget, first listener receives)
  emitEvents: {
    'task.completed': createFireAndForgetEvent(
      bsb.object({
        taskId: bsb.string({ description: 'Task identifier' }),
        duration: bsb.number({ description: 'Task duration in milliseconds' }),
        success: bsb.boolean('Whether the task completed successfully')
      }, 'Task completion parameters'),
      'Emitted when a task is completed'
    )
  },
  
  // Events this service listens to (fire-and-forget)
  onEvents: {
    'task.assigned': createFireAndForgetEvent(
      bsb.object({
        taskId: bsb.string({ description: 'Task identifier' }),
        type: bsb.string({ description: 'Task type' }),
        priority: bsb.enum(['low', 'medium', 'high', 'urgent'], 'Task priority level')
      }, 'Task assignment parameters'),
      'Handle new task assignments'
    )
  },
  
  // Returnable events this service emits (requests from this service)
  emitReturnableEvents: {
    'resource.request': createReturnableEvent(
      bsb.object({
        resourceType: bsb.string({ description: 'Type of resource requested' }),
        amount: bsb.number({ description: 'Amount of resources needed' }),
        timeout: optional(bsb.number({ description: 'Request timeout in milliseconds' }))
      }, 'Resource request parameters'),
      bsb.object({
        allocated: bsb.boolean('Whether resources were allocated'),
        resourceId: optional(bsb.string({ description: 'Allocated resource identifier' })),
        waitTime: optional(bsb.number({ description: 'Wait time in milliseconds' }))
      }, 'Resource allocation response'),
      'Request resource allocation'
    )
  },
  
  // Returnable events this service listens to (requests to this service)
  onReturnableEvents: {
    calculate: createReturnableEvent(
      bsb.object({
        a: bsb.number({ description: 'First number' }),
        b: bsb.number({ description: 'Second number' })
      }, 'Calculate input parameters'),
      bsb.number({ description: 'Calculation result' }),
      'Calculate with two numbers'
    ),
    'health.check': createReturnableEvent(
      bsb.object({
        includeDetails: bsb.boolean('Whether to include detailed information')
      }, 'Health check parameters'),
      bsb.object({
        status: bsb.enum(['healthy', 'degraded', 'unhealthy'], 'Service health status'),
        uptime: bsb.number({ description: 'Service uptime in milliseconds' }),
        details: optional(bsb.record(bsb.string({ description: 'Detail key' }), bsb.unknown('Detail value'), 'Health check details'))
      }, 'Health check response'),
      'Perform health check'
    )
  },
  
  // Broadcast events this service emits (all listeners receive)
  emitBroadcast: {
    'metrics.report': createBroadcastEvent(
      bsb.object({
        timestamp: bsb.datetime('Metrics timestamp'),
        metrics: bsb.record(bsb.string({ description: 'Metric name' }), bsb.number({ description: 'Metric value' }), 'Performance metrics'),
        period: bsb.string({ description: 'Reporting period' })
      }, 'Metrics report parameters'),
      'Broadcast performance metrics'
    )
  },
  
  // Broadcast events this service listens to
  onBroadcast: {
    'emergency.stop': createBroadcastEvent(
      bsb.object({
        reason: bsb.string({ description: 'Emergency stop reason' }),
        immediate: bsb.boolean('Whether to stop immediately without cleanup')
      }, 'Emergency stop parameters'),
      'Listen for emergency stop broadcasts'
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
  public initAfterPlugins: string[] = [];

  dispose?(): void;

  private service1: ServiceClient<Service1, typeof Service1EventSchemas, typeof Service1>;
  private service3: ServiceClient<Service3, typeof Service3EventSchemas, typeof Service3>;

  constructor(config: BSBServiceConstructor<InstanceType<typeof Config>, typeof EventSchemas>) {
    super(config);
    this.service1 = new ServiceClient(Service1, this);
    this.service3 = new ServiceClient(Service3, this);
  }

  public async init(obs: Observable) {
    this.events.onReturnableEvent("calculate", obs, async (obs: Observable, input) => {
      obs.log.info("Calculating {a} * {b}", { a: input.a, b: input.b });
      return input.a * input.b;
    });
  }

  public async run(obs: Observable) {
    obs.log.info("Running service-default2");
    const result = await this.service1.events.emitEventAndReturn("calculate", obs, {
      a: 5,
      b: 5
    }, 5);
    await this.service3.events.onReturnableEvent("calculate", obs, async (obs: Observable, input) => {
      obs.log.info("Calculating {a} * {b}", { a: input.a, b: input.b });
      return input.a * input.b;
    });
    obs.log.info("Calculation result: {result}", { result });
  }
}
