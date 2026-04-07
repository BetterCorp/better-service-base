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

import {
  createFakeDTrace,
  DTrace,
  BSBEventSchemas,
  Observable,
  ServiceClientEventSchemas,
} from "../interfaces/index.js";
import { BSBService, BSBServiceClientDefinition } from "./BSBService.js";
import { BSBError } from "./errorMessages.js";
import { PluginEvents } from "./PluginEvents.js";
import { Tools } from "./tools.js";

/**
 * @hidden
 */
function internalTrace(span: string): DTrace {
  return createFakeDTrace("base/BSBServiceClient", span);
}

/**
 * @hidden
 * ONLY USE THIS IF YOU NEED SPECIFIC CLIENT LOGIC, OTHERWISE USE ServiceClient
 */
/**
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBServiceClient.html | API: BSBServiceClient}
 */
export abstract class BSBServiceClient<
  Service extends BSBService<any, any> = BSBService<any, BSBEventSchemas>
> {
  public declare readonly events: PluginEvents<ServiceClientEventSchemas<BSBEventSchemas>>;

  constructor(context: BSBService) {
    context._clients.push(this);
  }

  public abstract readonly pluginName: string;
  public abstract readonly initBeforePlugins?: Array<string>;
  public abstract readonly initAfterPlugins?: Array<string>;
  public abstract readonly runBeforePlugins?: Array<string>;
  public abstract readonly runAfterPlugins?: Array<string>;

  public abstract dispose?(): void;

  /**
   * Init
   * Optional function to be called when the client is being initialized
   *
   * @remarks
   * **v9 BREAKING CHANGE**: Now requires Observable instead of DTrace.
   *
   * @param obs - Observable context with logging, metrics, and trace information
   */
  public abstract init?(obs: Observable): Promise<void>;

  /**
   * Run
   * Optional function to be called when the client is being run
   *
   * @remarks
   * **v9 BREAKING CHANGE**: Now requires Observable instead of DTrace.
   *
   * @param obs - Observable context with logging, metrics, and trace information
   */
  public abstract run?(obs: Observable): Promise<void>;
}

/**
 * Instantiates a link to a Service Plugin.
 * 
 * Create a new ServiceClient based on a plugin class/definition and then use the events from that plugin.
 * 
 * @example
 * ```typescript
 * // Example Service Plugin (just an example, not a real plugin):
 * 
 * import { Plugin as Service1 } from "./myplugin.js";
 * 
 * export class Plugin
 * extends BSBService<null, Events> {
 *  private service1: ServiceClient<Service1>;
 * 
 *  constructor(config: BSBServiceConstructor) {
 *    super(config);
 *    this.service1 = new ServiceClient(Service1, this);
 *  }
 * 
 *  public async init(trace: DTrace) {
 *    this.events.onReturnableEvent("calculate", trace, async (iTrace: DTrace, a: number, b: number) => {
 *      this.log.info(iTrace, "Calculating {a} * {b}", { a, b });
 *      return a * b;
 *    });
 *  }
 * }
 * ```
 * 
 * @group Services
 * @category Plugins
 */
export class ServiceClient<
  Service extends BSBService<any, TEventSchemas>,
  TEventSchemas extends BSBEventSchemas = any,
  ServiceT extends { PLUGIN_CLIENT: BSBServiceClientDefinition } = any
>
  extends BSBServiceClient<Service> {
  /**
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/ServiceClient.html | API: ServiceClient}
   */
  public readonly pluginName: string = "{UNSET SERVICE CLIENT PLUGIN NAME}";
  public readonly initBeforePlugins?: Array<string>;
  public readonly initAfterPlugins?: Array<string>;
  public readonly runBeforePlugins?: Array<string>;
  public readonly runAfterPlugins?: Array<string>;

  public dispose?(): void;

  /**
   * Init (v9: Observable only)
   */
  public init?(obs: Observable): Promise<void>;

  /**
   * Run (v9: Observable only)
   */
  public run?(obs: Observable): Promise<void>;

  public declare events: PluginEvents<ServiceClientEventSchemas<TEventSchemas>>;

  constructor(service: ServiceT, context: BSBService) {
    super(context);
    if (!Tools.isObject(service.PLUGIN_CLIENT)) {
      throw new BSBError(internalTrace("ServiceClient"), "Plugin client is not defined in the service!");
    }
    if (!Tools.isString(service.PLUGIN_CLIENT.name)) {
      throw new BSBError(internalTrace("ServiceClient"), "Plugin client name is not defined in the service!");
    }
    this.pluginName = service.PLUGIN_CLIENT.name;
    this.initBeforePlugins = service.PLUGIN_CLIENT.initBeforePlugins;
    this.initAfterPlugins = service.PLUGIN_CLIENT.initAfterPlugins;
    this.runBeforePlugins = service.PLUGIN_CLIENT.runBeforePlugins;
    this.runAfterPlugins = service.PLUGIN_CLIENT.runAfterPlugins;
  }
}

/**
 * @hidden
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBServiceClientRef
  extends BSBServiceClient<any> {
  public pluginName: string = "";
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  public dispose?(): void {
    throw new Error("Method not implemented.");
  }

  public init?(obs: Observable): Promise<void> {
    throw new Error("Method not implemented.");
  }

  public run?(obs: Observable): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
