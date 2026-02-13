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

import { DEBUG_MODE, IPluginObservable, Observable } from "../interfaces";
import { SBObservable } from "../serviceBase";
import { BSBReferenceConfigType } from "./PluginConfig";
import { ObservableBackend } from "./ObservableBackend";

/**
 * Main base config
 * @property appId - The unique app id of the app that is running
 * @property mode - The mode the app is running in
 * @property pluginName - The name of the plugin
 * @property cwd - The current working directory of the app
 * @property packageCwd - The directory of the package that contains the plugin
 * @property pluginCwd - The directory of the plugin (src/plugins/{pluginName} or lib/plugins/{pluginName})
 * @property region - The deployment region for resource context
 */
export interface MainBaseConfig {
  appId: string;
  mode: DEBUG_MODE;
  pluginName: string;
  cwd: string;
  packageCwd: string;
  pluginCwd: string;
  pluginVersion: string;
  region?: string;
}

/**
 * @hidden
 */
export abstract class MainBase {
  /**
   * The unique app id of the app that is running
   * @readonly
   * @type {string}
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/MainBase.html#appId | API: MainBase.appId}
   */
  public readonly appId: string = "tbd";

  /**
   * The mode the app is running in
   * @readonly
   * @type {DEBUG_MODE}
   * @example production (production mode - no debug)
   * @example production-debug (production mode - debug)
   * @example development (development mode - debug)
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/MainBase.html#mode | API: MainBase.mode}
   */
  public readonly mode: DEBUG_MODE = "development";
  /**
   * The current working directory of the app
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/MainBase.html#cwd | API: MainBase.cwd}
   */
  public readonly cwd: string;
  /**
   * The current working directory of the plugin
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/MainBase.html#packageCwd | API: MainBase.packageCwd}
   */
  public readonly packageCwd: string;
  /**
   * The current working directory of the service
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/MainBase.html#pluginCwd | API: MainBase.pluginCwd}
   */
  public readonly pluginCwd: string;
  /**
   * The name of the plugin
   * This is also the mapped name, or the name defined in the config rather than it's original defined name
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/MainBase.html#pluginName | API: MainBase.pluginName}
   */
  public declare readonly pluginName: string;

  /**
   * The deployment region for resource context
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/MainBase.html#region | API: MainBase.region}
   */
  public readonly region?: string;

  constructor(config: MainBaseConfig) {
    this.appId = config.appId;
    this.mode = config.mode;
    if (config.pluginName !== "") {
      this.pluginName = config.pluginName;
    }
    this.cwd = config.cwd;
    this.packageCwd = config.packageCwd;
    this.pluginCwd = config.pluginCwd;
    this.region = config.region;
  }

  /**
   * Dispose
   * Optional function to be called when the plugin is being disposed
   *
   * @example dispose?(): void; //to not use it
   * @example dispose() { your code here };
   */
  dispose?(): void;
}

/**
 * @hidden
 */
export abstract class Base
  extends MainBase {
  /**
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Base.html | API: Base}
   */
  constructor(config: MainBaseConfig) {
    super(config);
  }

  /**
   * Dispose
   * Optional function to be called when the plugin is being disposed
   *
   * @example dispose?(): void; //to not use it
   * @example dispose() { your code here };
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Base.html#dispose | API: Base.dispose}
   */
  abstract dispose?(): void;

  /**
   * Init
   * Optional function to be called when the plugin is being initialized
   * Can be sync or async
   *
   * @remarks
   * **v9 BREAKING CHANGE**: Now requires Observable instead of DTrace.
   * Observable provides unified access to logging, metrics, and tracing with automatic context propagation.
   *
   * @param obs - Observable context with logging, metrics, and trace information
   *
   * @example
   * ```typescript
   * async init(obs: Observable) {
   *   obs.log.info("Initializing plugin");
   *   // Set attributes for all child operations
   *   const withVersion = obs.setAttribute("plugin.version", "1.0.0");
   * }
   * ```
   *
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Base.html#init | API: Base.init}
   */
  public abstract init?(obs: Observable): Promise<void> | void;

  /**
   * Run
   * Optional function to be called when the plugin is being run
   * Can be sync or async
   *
   * @remarks
   * **v9 BREAKING CHANGE**: Now requires Observable instead of DTrace.
   * Observable provides unified access to logging, metrics, and tracing with automatic context propagation.
   *
   * @param obs - Observable context with logging, metrics, and trace information
   *
   * @example
   * ```typescript
   * async run(obs: Observable) {
   *   obs.log.info("Running plugin");
   *   // Create child span for work
   *   const workObs = obs.startSpan("do-work");
   *   // ... do work ...
   *   workObs.end();
   * }
   * ```
   *
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/Base.html#run | API: Base.run}
   */
  public abstract run?(obs: Observable): Promise<void> | void;
}

/**
 * @hidden
 */
export type ConfigPropertyTypeSafe<
  ReferencedConfig extends BSBReferenceConfigType
> = ReferencedConfig extends undefined
  ? undefined
  : ReferencedConfig extends null
  ? undefined
  : ReferencedConfig;

/**
 * @hidden
 */
export interface BaseWithConfigConfig<
  ReferencedConfig extends BSBReferenceConfigType
>
  extends MainBaseConfig {
  config: ConfigPropertyTypeSafe<ReferencedConfig>;
}

/**
 * @hidden
 * used by logging plugins (does not need events or logging since logging logs its own logs)
 */
export abstract class BaseWithConfig<
  ReferencedConfig extends BSBReferenceConfigType
>
  extends Base {
  /**
   * The config of the plugin
   * @type {PluginConfig}
   * @readonly
   */
  public readonly config: ConfigPropertyTypeSafe<ReferencedConfig>;

  constructor(config: BaseWithConfigConfig<ReferencedConfig>) {
    super(config);
    this.config = config.config;
  }
}

/**
 * BaseWithObservableConfig
 * @property sbObservable - Passed in observable base - can be used to create new plugin observable backend
 */
export interface BaseWithObservableConfig
  extends MainBaseConfig {
  sbObservable: SBObservable;
}

/**
 * @hidden
 * Base class with internal observable support for Observable creation.
 *
 * **v9 Architecture:**
 * - Logging and metrics accessed via Observable: `obs.log.info("message")`, `obs.metrics.counter(...)`
 * - Use `this.createObservable()` to create new root traces
 * - Pass Observable through all methods for trace context
 *
 * @see {@link Observable} for the unified observable interface
 * @see {@link BSBService.createObservable} for creating Observables
 */
export abstract class BaseWithObservable
  extends Base {
  /**
   * @hidden
   * Internal ObservableBackend instance for creating Observables.
   * NOT accessible to plugin code - use Observable instead.
   */
  private _observable: IPluginObservable;

  constructor(config: BaseWithObservableConfig) {
    super(config);
    this._observable = new ObservableBackend(
      config.mode,
      config.appId,
      config.pluginName,
      config.sbObservable,
    );

    // Observable backend initialized
    // Accessible via this.__internalObservable for creating Observables
  }

  /**
   * @hidden
   * Get internal observable backend for Observable creation.
   * NOT for direct plugin use.
   */
  protected get __internalObservable(): IPluginObservable {
    return this._observable;
  }
}

/**
 * @hidden
 */
export interface BaseWithObservableAndConfigConfig<
  ReferencedConfig extends BSBReferenceConfigType
>
  extends BaseWithObservableConfig,
  BaseWithConfigConfig<ReferencedConfig> {
}

/**
 * @hidden
 * Base class with config and internal observable support.
 * Use Observable for all logging and metrics operations.
 */
export abstract class BaseWithObservableAndConfig<
  ReferencedConfig extends BSBReferenceConfigType
>
  extends BaseWithConfig<ReferencedConfig> {
  /**
   * @hidden
   * Internal ObservableBackend instance for creating Observables.
   */
  private _observable: IPluginObservable;

  constructor(config: BaseWithObservableAndConfigConfig<ReferencedConfig>) {
    super(config);
    this._observable = new ObservableBackend(
      config.mode,
      config.appId,
      config.pluginName,
      config.sbObservable,
    );

    // Observable backend initialized
  }

  /**
   * @hidden
   * Get internal observable backend for Observable creation.
   */
  protected get __internalObservable(): IPluginObservable {
    return this._observable;
  }
}

/**
 * @hidden
 */
export const NS_PER_SEC = 1e9;
/**
 * @hidden
 */
export const MS_PER_NS = 1e-6;