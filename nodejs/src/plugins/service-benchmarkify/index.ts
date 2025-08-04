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

import { BSBPluginEvents, DTrace, ServiceClient, BSBServiceClientDefinition } from "../../index";
import { BSBService, BSBServiceConstructor } from "../../base/BSBService";
const Benchmarkify = require("benchmarkify");

export interface Events extends BSBPluginEvents {
  emitEvents: {};
  onEvents: {};
  emitReturnableEvents: {
  };
  onReturnableEvents: {
    add(a: number, b: number): number;
  };
  emitBroadcast: {};
  onBroadcast: {};
}

export class Plugin
  extends BSBService<null, Events> {
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
  async init(trace: DTrace): Promise<void> {
    await this.events.onReturnableEvent('add', trace, (trace: DTrace, a: number, b: number) => {
      return a + b;
    });
  };

  constructor(config: BSBServiceConstructor) {
    super(config);
    this.fakeSelf = new ServiceClient<Plugin>(Plugin, this);
  }

  public override async run(trace: DTrace) {
    this.log.info(trace, "Running service-default4");

    let benchmark = new Benchmarkify("Microservices benchmark").printHeader();

    const bench = benchmark.createSuite("Call local actions");

    const self = this;
    bench.add("BSB", async (done: Function) => {
      await self.fakeSelf.events.emitEventAndReturn('add', trace, 1, 5, 3);
      done();
    });
    console.log(JSON.stringify(await benchmark.run(), null, 2));
    // Use events to reverse text
    // const result = await this.events.emitEventAndReturn(
    //   "onReverseReturnable",
    //   trace,
    //   5,
    //   "teXt"
    // );

    // this.log.info(trace, "Reverse result: {result}", { result });
  }
}
