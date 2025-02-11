/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2024 BetterCorp (PTY) Ltd  
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
  IPluginLogging,
  IPluginMetrics,
} from "../interfaces";
import { BSBService, BSBServiceRef } from "./BSBService";
import { BSBError } from "./errorMessages";
import { PluginEvents } from "./PluginEvents";
import { Tools } from "./tools";

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
export abstract class BSBServiceClient<Service extends BSBService = any> {
  public declare readonly log: IPluginLogging;
  public declare readonly metrics: IPluginMetrics;
  public declare readonly events: PluginEvents<
    Service["_virtual_internal_events"]["emitEvents"],
    Service["_virtual_internal_events"]["onEvents"],
    Service["_virtual_internal_events"]["emitReturnableEvents"],
    Service["_virtual_internal_events"]["onReturnableEvents"],
    Service["_virtual_internal_events"]["emitBroadcast"],
    Service["_virtual_internal_events"]["onBroadcast"]
  >;

  constructor(context: BSBService) {
    context._clients.push(this);
  }

  public abstract readonly pluginName: string;
  public abstract readonly initBeforePlugins?: Array<string>;
  public abstract readonly initAfterPlugins?: Array<string>;
  public abstract readonly runBeforePlugins?: Array<string>;
  public abstract readonly runAfterPlugins?: Array<string>;

  public abstract dispose?(): void;

  public abstract init?(trace: DTrace): Promise<void>;

  public abstract run?(trace: DTrace): Promise<void>;
}

/**
 * @group Services
 * @category Using Plugins
 */
export class ServiceClient<
  Service extends BSBService<any>,
  ServiceT extends typeof BSBServiceRef = any
>
  extends BSBServiceClient<Service> {
  public readonly pluginName: string = "{UNSET SERVICE CLIENT PLUGIN NAME}";
  public readonly initBeforePlugins?: Array<string>;
  public readonly initAfterPlugins?: Array<string>;
  public readonly runBeforePlugins?: Array<string>;
  public readonly runAfterPlugins?: Array<string>;

  public dispose?(): void;

  public init?(trace: DTrace): Promise<void>;

  public run?(trace: DTrace): Promise<void>;

  public declare events: PluginEvents<
    Service["_virtual_internal_events"]["emitEvents"],
    Service["_virtual_internal_events"]["onEvents"],
    Service["_virtual_internal_events"]["emitReturnableEvents"],
    Service["_virtual_internal_events"]["onReturnableEvents"],
    Service["_virtual_internal_events"]["emitBroadcast"],
    Service["_virtual_internal_events"]["onBroadcast"]
  >;

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

  public init?(trace: DTrace): Promise<void> {
    throw new Error("Method not implemented.");
  }

  public run?(trace: DTrace): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
