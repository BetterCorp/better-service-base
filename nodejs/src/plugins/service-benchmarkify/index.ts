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

import { Observable, ServiceClient, BSBServiceClientDefinition } from "../../index";
import { BSBService, BSBServiceConstructor } from "../../base/BSBService";
import { createReturnableEvent, createFireAndForgetEvent, createBroadcastEvent } from "../../interfaces/schema-events";
import { z } from "zod";
const Benchmarkify = require("benchmarkify");

export const EventSchemas = {
  // Events this service emits (fire-and-forget, first listener receives)
  emitEvents: {
    'benchmark.started': createFireAndForgetEvent(
      z.object({
        name: z.string(),
        timestamp: z.string().datetime()
      }),
      'Benchmark test started'
    )
  },
  
  // Events this service listens to (fire-and-forget)
  onEvents: {
    'benchmark.trigger': createFireAndForgetEvent(
      z.object({
        testName: z.string().optional()
      }),
      'Trigger benchmark execution'
    )
  },
  
  // Returnable events this service emits (requests from this service)
  emitReturnableEvents: {
    'performance.test': createReturnableEvent(
      z.object({
        iterations: z.number().default(1000),
        warmup: z.boolean().default(true)
      }),
      z.object({
        duration: z.number(),
        opsPerSecond: z.number()
      }),
      'Request performance test execution'
    )
  },
  
  // Returnable events this service listens to (requests to this service)
  onReturnableEvents: {
    add: createReturnableEvent(
      z.object({
        a: z.number(),
        b: z.number()
      }),
      z.number(),
      'Add two numbers'
    ),
    void: createReturnableEvent(
      z.object({}),
      z.void(),
      'Void event for benchmarking'
    )
  },
  
  // Broadcast events this service emits (all listeners receive)
  emitBroadcast: {
    'benchmark.results': createBroadcastEvent(
      z.object({
        testName: z.string(),
        results: z.array(z.object({
          operation: z.string(),
          opsPerSecond: z.number(),
          duration: z.number()
        })),
        timestamp: z.string().datetime()
      }),
      'Broadcast benchmark results to all interested parties'
    )
  },
  
  // Broadcast events this service listens to
  onBroadcast: {
    'system.load': createBroadcastEvent(
      z.object({
        cpuUsage: z.number(),
        memoryUsage: z.number(),
        timestamp: z.string().datetime()
      }),
      'Listen for system load updates'
    )
  }
} as const;

export class Plugin
  extends BSBService<null, typeof EventSchemas> {
  public static readonly PLUGIN_CLIENT: BSBServiceClientDefinition = {
    name: "service-benchmarkify",
    initBeforePlugins: [],
    initAfterPlugins: [],
    runBeforePlugins: [],
    runAfterPlugins: []
  }
  public initBeforePlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public override initAfterPlugins: string[] = [];
  private fakeSelf: ServiceClient<Plugin>

  dispose?(): void;
  async init(obs: Observable): Promise<void> {
    await this.events.onReturnableEvent('add', obs, async (obs: Observable, input) => {
      return input.a + input.b;
    });
    await this.events.onReturnableEvent('void', obs, async (obs: Observable, input) => {
      return;
    });
    await this.events.onEvent('benchmark.trigger', obs, async (obs: Observable, input) => {
      obs.log.info("Benchmark triggered: {testName}", { testName: input.testName || 'default' });
      return;
    });
  };

  constructor(config: BSBServiceConstructor<null, typeof EventSchemas>) {
    super({
      ...config,
      eventSchemas: EventSchemas
    });
    this.fakeSelf = new ServiceClient<Plugin>(Plugin, this);
  }

  public override async run(obs: Observable) {
    obs.log.info("Running service-default4");

    let benchmark = new Benchmarkify("BSB benchmark").printHeader();

    const bench = benchmark.createSuite("Call local actions");

    const self = this;
    bench.add("BSB:emitEventAndReturn:add", async (done: Function) => {
      await self.fakeSelf.events.emitEventAndReturn('add', obs, { a: 5, b: 3 }, 1);
      done();
    });
    bench.add("BSB:emitEventAndReturn:void", async (done: Function) => {
      await self.fakeSelf.events.emitEventAndReturn('void', obs, {}, 1);
      done();
    });
    bench.add("BSB:emitEvent:void", async (done: Function) => {
      await self.fakeSelf.events.emitEvent('void', obs, {});
      done();
    });
    await benchmark.run()
    //console.log(JSON.stringify(await benchmark.run(), null, 2));
    // Use events to reverse text
    // const result = await this.events.emitEventAndReturn(
    //   "onReverseReturnable",
    //   trace,
    //   5,
    //   "teXt"
    // );

    // this.log.info(obs.trace, "Reverse result: {result}", { result });
  }
}
