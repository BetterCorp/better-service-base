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

/* eslint-disable @typescript-eslint/no-unused-vars */

import {DTrace, IPluginMetrics, ServiceEventsCallableBase} from "../interfaces";
import {SBEvents, SBMetrics} from "../serviceBase";
import {BaseWithLoggingAndConfig, BaseWithLoggingAndConfigConfig} from "./base";
import {BSBServiceClient} from "./BSBServiceClient";
import {BSBReferencePluginConfigDefinition, BSBReferencePluginConfigType} from "./pluginConfig";
import {BSBPluginEvents, BSBPluginEventsRef, PluginEvents} from "./PluginEvents";
import {PluginMetrics} from "./PluginMetrics";

export interface BSBServiceConstructor<
    ReferencedConfig extends BSBReferencePluginConfigType = any
>
    extends BaseWithLoggingAndConfigConfig<
        ReferencedConfig extends null
            ? null
            : BSBReferencePluginConfigDefinition<ReferencedConfig>
    > {
  sbEvents: SBEvents;
  sbMetrics: SBMetrics;
}

export interface BSBServiceClientDefinition {
  name: string;
  initBeforePlugins?: Array<string>;
  initAfterPlugins?: Array<string>;
  runBeforePlugins?: Array<string>;
  runAfterPlugins?: Array<string>;
}

/**
 * @group Services
 * @category Plugin Development
 */
export abstract class BSBService<
    ReferencedConfig extends BSBReferencePluginConfigType = any,
    Events extends BSBPluginEvents = BSBPluginEventsRef
>
    extends BaseWithLoggingAndConfig<
        ReferencedConfig extends null
            ? null
            : BSBReferencePluginConfigDefinition<ReferencedConfig>
    > {
  public static PLUGIN_CLIENT: BSBServiceClientDefinition;
  public abstract readonly initBeforePlugins?: Array<string>;
  public abstract readonly initAfterPlugins?: Array<string>;
  public abstract readonly runBeforePlugins?: Array<string>;
  public abstract readonly runAfterPlugins?: Array<string>;
  public abstract readonly methods: ServiceEventsCallableBase;
  public declare readonly _virtual_internal_events: {
    onEvents: Events["onEvents"];
    emitEvents: Events["emitEvents"];
    onReturnableEvents: Events["onReturnableEvents"];
    emitReturnableEvents: Events["emitReturnableEvents"];
    onBroadcast: Events["onBroadcast"];
    emitBroadcast: Events["emitBroadcast"];
  };
  public readonly metrics: IPluginMetrics;
  public readonly events: PluginEvents<
      Events["onEvents"],
      Events["emitEvents"],
      Events["onReturnableEvents"],
      Events["emitReturnableEvents"],
      Events["onBroadcast"],
      Events["emitBroadcast"]
  >;
  public _clients: Array<BSBServiceClient<any>> = [];

  constructor(config: BSBServiceConstructor<ReferencedConfig>) {
    super(config);
    this.events = new PluginEvents(config.mode, config.sbEvents, this);
    this.metrics = new PluginMetrics(config.pluginName, config.sbMetrics);
  }
}

/**
 * @hidden
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBServiceRef
    extends BSBService<any> {
  public static PLUGIN_CLIENT: BSBServiceClientDefinition = {
    name: "BSBServiceRef",
  };
  public methods = {};
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  dispose?(): void;

  init?(trace: DTrace): void | Promise<void>;

  run?(trace: DTrace): void | Promise<void>;

  constructor(config: BSBServiceConstructor<null>) {
    super(config);
  }
}
