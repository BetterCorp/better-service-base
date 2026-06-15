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
  BSBConfig, BSBConfigRef,
  BSBEvents,
  BSBEventsRef,
  BSBObservable,
  BSBObservableRef,
  BSBPluginConfig,
  BSBService,
  BSBServiceRef,
} from "../base/index.js";
import {EventsEventTypes} from "./events.js";

/**
 * @hidden
 */
/**
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_plugins | API: interfaces/plugins}
 */
export const PluginTypes = {
  config: "config",
  events: "events",
  observable: "observable",
  service: "service",
} as const;

/**
 * @hidden
 */
export type PluginType = (typeof PluginTypes)[keyof typeof PluginTypes];

/**
 * Marks all properties of an object read only and all nested objects read only
 * @hidden
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends (infer R)[]
                           ? DeepReadonlyArray<R>
                           : T[P] extends Function
                             ? T[P]
                             : T[P] extends object
                               ? DeepReadonly<T[P]>
                               : T[P];
};

/**
 * Marks all properties of an array read only and all nested objects read only
 * @hidden
 */
export interface DeepReadonlyArray<T>
    extends ReadonlyArray<DeepReadonly<T>> {
}

/**
 * @hidden
 */
export interface IPluginDefinition {
  package?: string | null;
  plugin: string;
  name: string;
  version: string;
}

/**
 * @hidden
 */
export interface IPluginBuilder {
  name: string;
  pluginName: string;
  version: string;
  pluginFile: string;
  pluginDir: string;
  installerFile: string | null;
}

/**
 * @hidden
 */
export type PluginTypeDefinition<T extends PluginType> =
    T extends typeof PluginTypes.service
    ? BSBService
    : T extends typeof PluginTypes.observable
      ? BSBObservable<any>
      : T extends typeof PluginTypes.config
        ? BSBConfig
        : T extends typeof PluginTypes.events
          ? BSBEvents
          : never;

/**
 * @hidden
 */
export type PluginTypeDefinitionRef<T extends PluginType> =
    T extends typeof PluginTypes.service
    ? typeof BSBServiceRef
    : T extends typeof PluginTypes.observable
      ? typeof BSBObservableRef
      : T extends typeof PluginTypes.config
        ? typeof BSBConfigRef
        : T extends typeof PluginTypes.events
          ? typeof BSBEventsRef
          : never;

/**
 * @hidden
 */
export interface IPluginBuilt<T extends PluginType>
    extends IPluginBuilder {
  config: any;
  plugin: PluginTypeDefinition<T>;
}

/**
 * @hidden
 */
export interface PluginDefinition {
  package?: string | null;
  version: string | null;
  plugin: string;
  //name: string;
  enabled: boolean;
}

/**
 * @hidden
 */
export type FilterDetailed<T extends string | number | symbol = any> = Record<
    T,
    {
      plugins: Array<string>;
      enabled: boolean;
    }
>;

/**
 * @hidden
 */
export type EventsFilterDetailed = FilterDetailed<EventsEventTypes>;

/**
 * @hidden
 */
export type EventsFilter =
    | EventsFilterDetailed // eventsDetailed
    | Record<EventsEventTypes, boolean> // eventsState
    | Record<EventsEventTypes, Array<string>> // eventsPlugins
    | Array<EventsEventTypes>; // events

/**
 * @hidden
 */
export interface EventsConfig
    extends PluginDefinition {
  filter?: EventsFilter;
}

/**
 * @hidden
 */
export type FilterOnType = // see EventsFilter and LoggingFilter for more details
    "all" | "events" | "eventsState" | "eventsPlugins" | "eventsDetailed";

/**
 * @hidden
 */
export interface LoadedPlugin<
    NamedType extends PluginType,
    ClassType extends PluginTypeDefinitionRef<NamedType> = PluginTypeDefinitionRef<NamedType>
> {
  name: string;
  ref: string;
  version: string;
  serviceConfig: BSBPluginConfig<any> | null;
  plugin: ClassType;
  packageCwd: string;
  pluginCwd: string;
  pluginPath: string;
}

/**
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#module-interfaces_plugins | API: interfaces/plugins}
 */
