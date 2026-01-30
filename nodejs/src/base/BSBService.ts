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

/* eslint-disable @typescript-eslint/no-unused-vars */

import { DTrace, IPluginMetrics, BSBEventSchemas, Observable } from "../interfaces";
import { SBEvents, SBObservable } from "../serviceBase";
import { BaseWithLoggingAndConfig, BaseWithLoggingAndConfigConfig } from "./base";
import { BSBServiceClient } from "./BSBServiceClient";
import { BSBReferencePluginConfigDefinition, BSBReferencePluginConfigType } from "./PluginConfig";
import { PluginEvents } from "./PluginEvents";
import { PluginMetrics } from "./PluginMetrics";
import { ResourceContext, ResourceContextBuilder } from "./ResourceContext";
import { PluginObservable } from "./PluginObservable";
import { PluginLogging } from "./PluginLogging";

/**
 * @hidden
 */
export interface BSBServiceConstructor<
  ReferencedConfig extends BSBReferencePluginConfigType = any,
  TEventSchemas extends BSBEventSchemas = BSBEventSchemas
>
  extends BaseWithLoggingAndConfigConfig<
    ReferencedConfig extends null
    ? null
    : BSBReferencePluginConfigDefinition<ReferencedConfig>
  > {
  sbEvents: SBEvents;
  sbObservable: SBObservable;
  eventSchemas?: TEventSchemas;
}

/**
 * @hidden
 */
export interface BSBServiceClientDefinition {
  name: string;
  initBeforePlugins?: Array<string>;
  initAfterPlugins?: Array<string>;
  runBeforePlugins?: Array<string>;
  runAfterPlugins?: Array<string>;
}

/**
 * @group Services
 * @category Plugins
 */
/**
 * Base class for implementing a service plugin.
 *
 * Lifecycle:
 *  - constructor(config)
 *  - init(trace): async initialization and event registration
 *  - run(trace): start processing
 *  - dispose(): cleanup resources
  *
  * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBService.html | API: BSBService}
 */
export abstract class BSBService<
  ReferencedConfig extends BSBReferencePluginConfigType = any,
  TEventSchemas extends BSBEventSchemas = BSBEventSchemas
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
  
  /** Metrics helper scoped to this plugin */
  public readonly metrics: IPluginMetrics;
  /** Schema-first event API for this plugin with automatic validation */
  public readonly events: PluginEvents<TEventSchemas>;
  /**
   * @hidden
   */
  public _clients: Array<BSBServiceClient<any>> = [];
  /**
   * @hidden
   */
  private _resourceContext: ResourceContext;

  constructor(config: BSBServiceConstructor<ReferencedConfig, TEventSchemas>) {
    super(config);
    this.events = new PluginEvents(config.mode, config.sbEvents, this, config.eventSchemas || {} as TEventSchemas);
    this.metrics = new PluginMetrics(config.appId, config.pluginName, config.sbObservable);

    // Build resource context at construction time
    this._resourceContext = ResourceContextBuilder.build(
      {
        appId: config.appId,
        mode: config.mode,
        pluginName: config.pluginName,
        cwd: config.cwd,
        packageCwd: config.packageCwd,
        pluginCwd: config.pluginCwd,
        pluginVersion: (config as any).pluginVersion || 'unknown'
      },
      (config as any).region
    );
  }

  /**
   * Create an Observable from a DTrace with plugin's resource context
   *
   * This method wraps a DTrace object in an Observable that provides:
   * - Automatic trace context for logging
   * - Resource context (service name, version, region, etc.)
   * - Immutable attribute propagation
   * - Child span creation
   *
   * @param trace - DTrace object
   * @param attributes - Optional initial attributes
   * @returns Observable wrapping the trace
   *
   * @example
   * ```typescript
   * const obs = this.createObservable(trace, { "user.id": "123" });
   * obs.log.info("Processing request");
   * ```
   *
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBService.html#createObservable | API: BSBService.createObservable}
   */
  protected createObservable(
    trace: DTrace,
    attributes?: Record<string, string | number | boolean>
  ): Observable {
    return new PluginObservable(
      trace,
      this._resourceContext,
      this.log as PluginLogging,
      this.metrics as PluginMetrics,
      attributes
    );
  }
}

/**
 * @hidden
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBServiceRef
  extends BSBService<any, BSBEventSchemas> {
  public static PLUGIN_CLIENT: BSBServiceClientDefinition = {
    name: "BSBServiceRef",
  };
  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  dispose?(): void;

  init?(obs: Observable): void | Promise<void>;

  run?(obs: Observable): void | Promise<void>;

  constructor(config: BSBServiceConstructor<null, BSBEventSchemas>) {
    super(config);
  }
}
