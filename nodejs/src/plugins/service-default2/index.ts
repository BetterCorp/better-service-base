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

import { Observable, ServiceClient } from "../../index";
import { BSBService, BSBServiceConstructor } from "../../base/BSBService";
import { Plugin as Service1, EventSchemas as Service1EventSchemas } from "../service-default1";
import { Plugin as Service3, EventSchemas as Service3EventSchemas } from "../service-default3";
import { createFireAndForgetEvent, createReturnableEvent, createBroadcastEvent } from "../../interfaces/schema-events";
import { z } from "zod";
export const EventSchemas = {
  // Events this service emits (fire-and-forget, first listener receives)
  emitEvents: {
    'task.completed': createFireAndForgetEvent(
      z.object({
        taskId: z.string(),
        duration: z.number(),
        success: z.boolean()
      }),
      'Emitted when a task is completed'
    )
  },
  
  // Events this service listens to (fire-and-forget)
  onEvents: {
    'task.assigned': createFireAndForgetEvent(
      z.object({
        taskId: z.string(),
        type: z.string(),
        priority: z.enum(['low', 'medium', 'high', 'urgent'])
      }),
      'Handle new task assignments'
    )
  },
  
  // Returnable events this service emits (requests from this service)
  emitReturnableEvents: {
    'resource.request': createReturnableEvent(
      z.object({
        resourceType: z.string(),
        amount: z.number(),
        timeout: z.number().optional()
      }),
      z.object({
        allocated: z.boolean(),
        resourceId: z.string().optional(),
        waitTime: z.number().optional()
      }),
      'Request resource allocation'
    )
  },
  
  // Returnable events this service listens to (requests to this service)
  onReturnableEvents: {
    calculate: createReturnableEvent(
      z.object({
        a: z.number(),
        b: z.number()
      }),
      z.number(),
      'Calculate with two numbers'
    ),
    'health.check': createReturnableEvent(
      z.object({
        includeDetails: z.boolean().default(false)
      }),
      z.object({
        status: z.enum(['healthy', 'degraded', 'unhealthy']),
        uptime: z.number(),
        details: z.record(z.string(), z.unknown()).optional()
      }),
      'Perform health check'
    )
  },
  
  // Broadcast events this service emits (all listeners receive)
  emitBroadcast: {
    'metrics.report': createBroadcastEvent(
      z.object({
        timestamp: z.string().datetime(),
        metrics: z.record(z.string(), z.number()),
        period: z.string()
      }),
      'Broadcast performance metrics'
    )
  },
  
  // Broadcast events this service listens to
  onBroadcast: {
    'emergency.stop': createBroadcastEvent(
      z.object({
        reason: z.string(),
        immediate: z.boolean().default(false)
      }),
      'Listen for emergency stop broadcasts'
    )
  }
} as const;

export class Plugin
  extends BSBService<null, typeof EventSchemas> {
  public initBeforePlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  dispose?(): void;
  public initAfterPlugins: string[] = [];
  private service1: ServiceClient<Service1, typeof Service1EventSchemas, typeof Service1>;
  private service3: ServiceClient<Service3, typeof Service3EventSchemas, typeof Service3>;

  constructor(config: BSBServiceConstructor<null, typeof EventSchemas>) {
    super({
      ...config,
      eventSchemas: EventSchemas
    });
    this.service1 = new ServiceClient(Service1, this);
    this.service3 = new ServiceClient(Service3, this);
  }

  public async init(obs: Observable) {
    this.events.onReturnableEvent("calculate", obs, async (obs: Observable, input) => {
      this.log.info(obs.trace, "Calculating {a} * {b}", { a: input.a, b: input.b });
      return input.a * input.b;
    });
  }

  public async run(obs: Observable) {
    this.log.info(obs.trace, "Running service-default2");
    const result = await this.service1.events.emitEventAndReturn("calculate", obs, { 
      a: 5, 
      b: 5 
    }, 5)
    await this.service3.events.onReturnableEvent("calculate", obs, async (obs: Observable, input) => {
      this.log.info(obs.trace, "Calculating {a} * {b}", { a: input.a, b: input.b });
      return input.a * input.b;
    });
    this.log.info(obs.trace, "Calculation result: {result}", { result });

    // Use events to calculate instead of direct method calls
    // const result = await this.events.emitEventAndReturn(
    //   "calculate",
    //   trace,
    //   5,
    //   10,
    //   12
    // );

    // this.log.info(obs.obs, "Calculation result: {result}", { result });
  }
}
