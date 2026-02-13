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

import { DTrace, Trace, BSBEventSchemas, Observable, EventSchemaExport, exportEventSchemas, ServiceClientEventSchemas } from "../interfaces";
import { SBEvents, SBObservable } from "../serviceBase";
import { BaseWithObservableAndConfig, BaseWithObservableAndConfigConfig } from "./base";
import { BSBServiceClient } from "./BSBServiceClient";
import { BSBReferencePluginConfigDefinition, BSBReferencePluginConfigType, BSBPluginConfig, createConfigSchema } from "./PluginConfig";
import { PluginEvents } from "./PluginEvents";
import { ResourceContext, ResourceContextBuilder } from "./ResourceContext";
import { PluginObservable } from "./PluginObservable";
import { z } from "zod";

/**
 * @hidden
 */
export interface BSBServiceConstructor<
  ReferencedConfig extends BSBReferencePluginConfigType = any,
  TEventSchemas extends BSBEventSchemas = BSBEventSchemas
>
  extends BaseWithObservableAndConfigConfig<
    ReferencedConfig extends null
    ? null
    : BSBReferencePluginConfigDefinition<ReferencedConfig> & any
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
 * v9 Breaking Change: PLUGIN_CLIENT is now auto-generated from Config.metadata.
 * You must provide a static Config property pointing to your Config class.
 *
 * Lifecycle:
 *  - constructor(config)
 *  - init(trace): async initialization and event registration
 *  - run(trace): start processing
 *  - dispose(): cleanup resources
  *
  * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBService.html | API: BSBService}
  *
  * @example
  * ```typescript
  * export const Config = createConfigSchema(
  *   { name: 'service-demo', description: 'Demo Service' },
  *   ConfigSchema
  * );
  *
  * export class Plugin extends BSBService<typeof Config, typeof EventSchemas> {
  *   static Config = Config; // Required for auto-generation
  *   // PLUGIN_CLIENT is auto-generated from Config.metadata
  * }
  * ```
 */
export abstract class BSBService<
  ReferencedConfig extends BSBReferencePluginConfigType = any,
  TEventSchemas extends BSBEventSchemas = BSBEventSchemas
>
  extends BaseWithObservableAndConfig<
    ReferencedConfig extends null
    ? null
    : BSBReferencePluginConfigDefinition<ReferencedConfig> & any
  > {
  /**
   * Static reference to the Config class created with createConfigSchema().
   * Required for auto-generating PLUGIN_CLIENT from metadata.
   *
   * v9: This must be set on your plugin class for PLUGIN_CLIENT auto-generation to work.
   */
  static Config: any;

  /**
   * Static reference to EventSchemas created with createEventSchemas().
   * Required for schema export functionality.
   *
   * v9: Set this on your plugin class to enable schema export.
   */
  static EventSchemas: BSBEventSchemas;

  /**
   * Auto-generated from Config.metadata.
   * Do not set this manually - it will be ignored and replaced with auto-generated value.
   *
   * v9 Breaking Change: This is now a getter that derives from Config.metadata.
   * If you have a manual PLUGIN_CLIENT property, remove it and set static Config instead.
   */
  public static get PLUGIN_CLIENT(): BSBServiceClientDefinition {
    // Check if Config is set
    if (!(this as any).Config) {
      throw new Error(
        `[BSB v9] PLUGIN_CLIENT auto-generation requires a static Config property.\n` +
        `Add this to your plugin class:\n` +
        `  static Config = Config;\n` +
        `\n` +
        `See migration guide: https://bsbcode.dev/migration/v9-breaking-changes`
      );
    }

    const ConfigClass = (this as any).Config as typeof BSBPluginConfig;

    // Check if using old v8 Config class pattern (no metadata)
    if (!ConfigClass.metadata) {
      throw new Error(
        `[BSB v9] Config class must be created with createConfigSchema() helper.\n` +
        `Old v8 pattern (extending BSBPluginConfig directly) is not supported.\n` +
        `\n` +
        `Migration:\n` +
        `  // OLD v8:\n` +
        `  export class Config extends BSBPluginConfig<typeof ConfigSchema> {\n` +
        `    validationSchema = ConfigSchema;\n` +
        `  }\n` +
        `\n` +
        `  // NEW v9:\n` +
        `  export const Config = createConfigSchema(\n` +
        `    { name: 'plugin-name', description: 'Description' },\n` +
        `    ConfigSchema\n` +
        `  );\n` +
        `\n` +
        `See migration guide: https://bsbcode.dev/migration/v9-breaking-changes`
      );
    }

    const meta = ConfigClass.metadata;

    // Return auto-generated PLUGIN_CLIENT from metadata
    return {
      name: meta.name,
      initBeforePlugins: meta.initBeforePlugins,
      initAfterPlugins: meta.initAfterPlugins,
      runBeforePlugins: meta.runBeforePlugins,
      runAfterPlugins: meta.runAfterPlugins,
    };
  }

  /**
   * Export event schemas to JSON format for cross-language client generation.
   *
   * v9: Call this static method to generate JSON schemas for your plugin's events.
   * The generated JSON can be consumed by code generators in other languages
   * to create type-safe clients.
   *
   * @returns EventSchemaExport object with plugin metadata and event definitions
   *
   * @example
   * ```typescript
   * // In your plugin class:
   * export class Plugin extends BSBService<typeof Config, typeof EventSchemas> {
   *   static Config = Config;
   *   static EventSchemas = EventSchemas;
   * }
   *
   * // Export schemas (typically in build script):
   * const schemas = Plugin.exportSchemas();
   * fs.writeFileSync('schemas.json', JSON.stringify(schemas, null, 2));
   * ```
   */
  public static exportSchemas(): EventSchemaExport {
    // Check if Config is set
    if (!(this as any).Config) {
      throw new Error(
        `[BSB v9] Schema export requires a static Config property.\n` +
        `Add this to your plugin class:\n` +
        `  static Config = Config;\n`
      );
    }

    // Check if EventSchemas is set
    if (!(this as any).EventSchemas) {
      throw new Error(
        `[BSB v9] Schema export requires a static EventSchemas property.\n` +
        `Add this to your plugin class:\n` +
        `  static EventSchemas = EventSchemas;\n`
      );
    }

    const ConfigClass = (this as any).Config as typeof BSBPluginConfig;
    const eventSchemas = (this as any).EventSchemas as BSBEventSchemas;

    if (!ConfigClass.metadata) {
      throw new Error(
        `[BSB v9] Config class must be created with createConfigSchema() helper.`
      );
    }

    const meta = ConfigClass.metadata;

    return exportEventSchemas(
      meta.name,
      meta.version || '1.0.0',
      eventSchemas
    );
  }

  public abstract readonly initBeforePlugins?: Array<string>;
  public abstract readonly initAfterPlugins?: Array<string>;
  public abstract readonly runBeforePlugins?: Array<string>;
  public abstract readonly runAfterPlugins?: Array<string>;

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

    // Observable backend initialized

    this.events = new PluginEvents(config.mode, config.sbEvents, this, config.eventSchemas || {} as TEventSchemas, this.__internalObservable);

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
   * @param span - Optional Trace/Span object for lifecycle management (enables end() to work)
   * @returns Observable wrapping the trace
   *
   * @example
   * ```typescript
   * // Create observable from DTrace
   * const obs = this.createObservable(trace, { "user.id": "123" });
   * obs.log.info("Processing request");
   *
   * // Create observable from Trace with span lifecycle
   * const trace = this.__internalObservable.createTrace("http.request");
   * const obs = this.createObservable(trace.trace, {}, trace);
   * // ... do work ...
   * obs.end(); // Properly ends the span
   * ```
   *
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBService.html#createObservable | API: BSBService.createObservable}
   */
  protected createObservable(
    trace: DTrace,
    attributes?: Record<string, string | number | boolean>,
    span?: Trace
  ): Observable {
    return new PluginObservable(
      trace,
      this._resourceContext,
      this.__internalObservable,
      attributes,
      span
    );
  }

  /**
   * Create a new trace for distributed tracing
   *
   * Creates a new root trace with the given name and attributes. This is useful
   * for creating new traces in contexts like HTTP handlers where you want to start
   * a new trace for each request.
   *
   * @param name - Name for the trace (e.g., "http.request", "background.job")
   * @param attributes - Optional initial attributes
   * @returns Observable with a new trace and span that can be ended
   *
   * @example
   * ```typescript
   * // In an HTTP handler
   * async handleRequest(request: Request) {
   *   const obs = this.createTrace("http.request", {
   *     "http.method": request.method,
   *     "http.url": request.url
   *   });
   *
   *   try {
   *     await this.processRequest(obs, request);
   *     obs.end({ "http.status": 200 });
   *   } catch (error) {
   *     obs.error(error);
   *     obs.end({ "http.status": 500 });
   *   }
   * }
   * ```
   *
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/BSBService.html#createTrace | API: BSBService.createTrace}
   */
  public createTrace(
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): Observable {
    const trace = this.__internalObservable.createTrace(name, attributes ?? {});
    return this.createObservable(trace.trace, attributes ?? {}, trace);
  }

  /**
   * Create a self-client for calling this service's own events.
   *
   * Use this when you need to call your own event handlers from within the service
   * (e.g., HTTP handler calling the service's event-based API). This makes self-invocation
   * explicit in the code and avoids confusion about event flow.
   *
   * Call this method in the constructor and store the result if you need self-invocation.
   * Only create it if needed to minimize startup overhead.
   *
   * The self-client uses the runtime mapped plugin name from the instantiated plugin,
   * avoiding dependency on compile-time metadata or config. It's registered in the
   * _clients array and handled normally by the BSB lifecycle.
   *
   * @returns Self-client with events property for calling own events
   *
   * @example
   * ```typescript
   * export class Plugin extends BSBService<typeof Config, typeof EventSchemas> {
   *   private self;
   *
   *   constructor(config: BSBServiceConstructor<typeof Config, typeof EventSchemas>) {
   *     super({ ...config, eventSchemas: EventSchemas });
   *
   *     // Create self-client for HTTP handler to call own events
   *     this.self = this.createSelf();
   *   }
   *
   *   async handleHttpRequest(obs: Observable, body: any) {
   *     // Explicitly call own event handler
   *     const result = await this.self.events.emitEventAndReturn('todo.create', obs, body);
   *     return { status: 201, data: result };
   *   }
   * }
   * ```
   */
  protected createSelf() {
    const selfClient = new BSBSelfServiceClient<typeof this, TEventSchemas>(this);
    this._clients.push(selfClient);
    return selfClient;
  }
}

/**
 * @hidden
 * Internal self-service client for calling a service's own events.
 * Created by BSBService.createSelf() method.
 */
class BSBSelfServiceClient<
  Service extends BSBService<any, TEventSchemas>,
  TEventSchemas extends BSBEventSchemas = any
> extends BSBServiceClient<Service> {
  public readonly pluginName: string;
  public readonly initBeforePlugins?: Array<string>;
  public readonly initAfterPlugins?: Array<string>;
  public readonly runBeforePlugins?: Array<string>;
  public readonly runAfterPlugins?: Array<string>;

  public declare events: PluginEvents<ServiceClientEventSchemas<TEventSchemas>>;

  constructor(context: Service) {
    super(context);

    // Use runtime mapped plugin name from the instantiated plugin
    this.pluginName = context.pluginName;

    // No dependencies for self-client (same as parent service)
    this.initBeforePlugins = undefined;
    this.initAfterPlugins = undefined;
    this.runBeforePlugins = undefined;
    this.runAfterPlugins = undefined;

    // Share the same events instance as the parent service
    this.events = context.events;
  }

  // Self-client has no lifecycle of its own - it just shares the parent service's events
  public dispose?(): void {
    // No-op: self-client shares parent's lifecycle
  }

  public init?(obs: Observable): Promise<void> {
    // No-op: self-client shares parent's lifecycle
    return Promise.resolve();
  }

  public run?(obs: Observable): Promise<void> {
    // No-op: self-client shares parent's lifecycle
    return Promise.resolve();
  }
}

// Dummy Config for internal reference class
const BSBServiceRefConfig = createConfigSchema(
  {
    name: "BSBServiceRef",
    description: "Internal reference class",
  },
  z.null()
);

/**
 * @hidden
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBServiceRef
  extends BSBService<any, BSBEventSchemas> {
  static Config = BSBServiceRefConfig;

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
