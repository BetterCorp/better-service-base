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
import { BSBService, BSBServiceConstructor, createConfigSchema, bsb, optional } from "../../base";
import { createEventSchemas, createReturnableEvent, createFireAndForgetEvent, createBroadcastEvent } from "../../interfaces/schema-events";
import * as av from "@anyvali/js";
const Benchmarkify = require("benchmarkify");

export const Config = createConfigSchema(
  {
    name: 'service-benchmarkify',
    description: 'Benchmarking service for performance testing',
    image: '../docs/public/assets/images/bsb-logo.png',
    tags: ['benchmark', 'performance', 'test'],
  },
  av.optional(av.object({}, { unknownKeys: "strip" })).default({})
);

export const EventSchemas = createEventSchemas({
  // Events this service emits (fire-and-forget, first listener receives)
  emitEvents: {
    'benchmark.started': createFireAndForgetEvent(
      bsb.object({
        name: bsb.string({ description: 'Benchmark name' }),
        timestamp: bsb.datetime('Start timestamp')
      }, 'Benchmark start parameters'),
      'Benchmark test started'
    )
  },
  
  // Events this service listens to (fire-and-forget)
  onEvents: {
    'benchmark.trigger': createFireAndForgetEvent(
      bsb.object({
        testName: optional(bsb.string({ description: 'Name of test to run' }))
      }, 'Benchmark trigger parameters'),
      'Trigger benchmark execution'
    )
  },
  
  // Returnable events this service emits (requests from this service)
  emitReturnableEvents: {
    'performance.test': createReturnableEvent(
      bsb.object({
        iterations: bsb.number({ description: 'Number of iterations to run' }),
        warmup: bsb.boolean('Whether to run warmup iterations')
      }, 'Performance test parameters'),
      bsb.object({
        duration: bsb.number({ description: 'Test duration in milliseconds' }),
        opsPerSecond: bsb.number({ description: 'Operations per second' })
      }, 'Performance test results'),
      'Request performance test execution'
    )
  },
  
  // Returnable events this service listens to (requests to this service)
  onReturnableEvents: {
    add: createReturnableEvent(
      bsb.object({
        a: bsb.number({ description: 'First number' }),
        b: bsb.number({ description: 'Second number' })
      }, 'Add input parameters'),
      bsb.number({ description: 'Sum of numbers' }),
      'Add two numbers'
    ),
    void: createReturnableEvent(
      bsb.object({}, 'Empty parameters'),
      bsb.void(),
      'Void event for benchmarking'
    )
  },
  
  // Broadcast events this service emits (all listeners receive)
  emitBroadcast: {
    'benchmark.results': createBroadcastEvent(
      bsb.object({
        testName: bsb.string({ description: 'Test name' }),
        results: bsb.array(
          bsb.object({
            operation: bsb.string({ description: 'Operation name' }),
            opsPerSecond: bsb.number({ description: 'Operations per second' }),
            duration: bsb.number({ description: 'Duration in milliseconds' })
          }, 'Benchmark result entry'),
          { description: 'Array of benchmark results' }
        ),
        timestamp: bsb.datetime('Results timestamp')
      }, 'Benchmark results parameters'),
      'Broadcast benchmark results to all interested parties'
    )
  },
  
  // Broadcast events this service listens to
  onBroadcast: {
    'system.load': createBroadcastEvent(
      bsb.object({
        cpuUsage: bsb.number({ description: 'CPU usage percentage' }),
        memoryUsage: bsb.number({ description: 'Memory usage percentage' }),
        timestamp: bsb.datetime('Load measurement timestamp')
      }, 'System load parameters'),
      'Listen for system load updates'
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
  public override initAfterPlugins?: string[] | undefined;
  private self;

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

  constructor(config: BSBServiceConstructor<InstanceType<typeof Config>, typeof EventSchemas>) {
    super(config);
    this.self = new ServiceClient<Plugin, typeof EventSchemas, typeof Plugin>(Plugin, this);
  }

  public override async run(obs: Observable) {
    obs.log.info("Running service-benchmarkify");

    let benchmark = new Benchmarkify("BSB benchmark").printHeader();

    const bench = benchmark.createSuite("Call local actions");

    const self = this;
    bench.add("BSB:emitEventAndReturn:add", async (done: Function) => {
      await self.self.events.emitEventAndReturn('add', obs, { a: 5, b: 3 }, 1);
      done();
    });
    bench.add("BSB:emitEventAndReturn:void", async (done: Function) => {
      await self.self.events.emitEventAndReturn('void', obs, {}, 1);
      done();
    });
    await benchmark.run()
  }
}
