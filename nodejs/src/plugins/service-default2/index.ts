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

import { BSBPluginEvents, DTrace, ServiceClient } from "../../index";
import { BSBService, BSBServiceConstructor } from "../../base/BSBService";
import { Plugin as Service1 } from "../service-default1";
export interface Events extends BSBPluginEvents {
  emitEvents: {};
  onEvents: {};
  emitReturnableEvents: {
  };
  onReturnableEvents: {
    calculate: (a: number, b: number) => Promise<number>;
  };
  emitBroadcast: {};
  onBroadcast: {};
}

export class Plugin
  extends BSBService<null, Events> {
  public initBeforePlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  dispose?(): void;
  public initAfterPlugins: string[] = [];
  private service1: ServiceClient<Service1>;

  constructor(config: BSBServiceConstructor) {
    super(config);
    this.service1 = new ServiceClient(Service1, this);
  }

  public async init(trace: DTrace) {
    this.events.onReturnableEvent("calculate", trace, async (iTrace: DTrace, a: number, b: number) => {
      this.log.info(iTrace, "Calculating {a} * {b}", { a, b });
      return a * b;
    });
  }

  public async run(trace: DTrace) {
    this.log.info(trace, "Running service-default2");
    const result = await this.service1.events.emitEventAndReturn('calculate', trace, 5, 5, 5)
    this.log.info(trace, "Calculation result: {result}", { result });

    // Use events to calculate instead of direct method calls
    // const result = await this.events.emitEventAndReturn(
    //   "calculate",
    //   trace,
    //   5,
    //   10,
    //   12
    // );

    // this.log.info(trace, "Calculation result: {result}", { result });
  }
}
