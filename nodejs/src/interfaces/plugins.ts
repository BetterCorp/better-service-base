import { BSBService, BSBServiceRef } from "../base/service";
import { LoggingEventTypes } from "./logging";
import { BSBLogging, BSBLoggingRef } from "../base/logging";
import { BSBConfig, BSBConfigRef } from "../base/config";
import { EventsEventTypes } from "./events";
import { BSBEvents } from "../base/events";
import { BSBEventsRef } from "../base/events";
import { BSBServiceConfig } from ".";

export const PluginTypes = {
  config: "config",
  events: "events",
  logging: "logging",
  service: "service",
} as const;
export type PluginType = (typeof PluginTypes)[keyof typeof PluginTypes];

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends (infer R)[]
    ? DeepReadonlyArray<R>
    : T[P] extends Function
    ? T[P]
    : T[P] extends object
    ? DeepReadonly<T[P]>
    : T[P];
};
export interface DeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> {}
export interface IPluginDefinition {
  package?: string | null;
  plugin: string;
  name: string;
  version: string;
}
export interface IPluginBuilder {
  name: string;
  pluginName: string;
  version: string;
  pluginFile: string;
  pluginDir: string;
  installerFile: string | null;
}
export type PluginTypeDefinition<T extends PluginType> =
  T extends typeof PluginTypes.service
    ? BSBService
    : T extends typeof PluginTypes.logging
    ? BSBLogging<any>
    : T extends typeof PluginTypes.config
    ? BSBConfig
    : T extends typeof PluginTypes.events
    ? BSBEvents
    : never;
export type PluginTypeDefinitionRef<T extends PluginType> =
  T extends typeof PluginTypes.service
    ? typeof BSBServiceRef
    : T extends typeof PluginTypes.logging
    ? typeof BSBLoggingRef
    : T extends typeof PluginTypes.config
    ? typeof BSBConfigRef
    : T extends typeof PluginTypes.events
    ? typeof BSBEventsRef
    : never;

export interface IPluginBuit<T extends PluginType> extends IPluginBuilder {
  config: any;
  plugin: PluginTypeDefinition<T>;
}
export interface PluginDefition {
  package?: string | null;
  plugin: string;
  //name: string;
  enabled: boolean;
}
export type FilterDetailed<T extends string | number | symbol = any> = Record<
  T,
  {
    plugins: Array<string>;
    enabled: boolean;
  }
>;
export type LoggingFilterDetailed = FilterDetailed<LoggingEventTypes>;
export type LoggingFilter =
  | LoggingFilterDetailed // eventsDetailed
  | Record<LoggingEventTypes, boolean> // eventsState
  | Record<LoggingEventTypes, Array<string>> // eventsPlugins
  | Array<LoggingEventTypes>; // events
export interface LoggingConfig extends PluginDefition {
  filter?: LoggingFilter;
}
export type EventsFilterDetailed = FilterDetailed<EventsEventTypes>;
export type EventsFilter =
  | EventsFilterDetailed // eventsDetailed
  | Record<EventsEventTypes, boolean> // eventsState
  | Record<EventsEventTypes, Array<string>> // eventsPlugins
  | Array<EventsEventTypes>; // events
export interface EventsConfig extends PluginDefition {
  filter?: EventsFilter;
}
export type FilterOnType = // see EventsFilter and LoggingFilter for more details
  "all" | "events" | "eventsState" | "eventsPlugins" | "eventsDetailed";

export interface LoadedPlugin<
  NamedType extends PluginType,
  ClassType extends PluginTypeDefinitionRef<NamedType> = PluginTypeDefinitionRef<NamedType>
> {
  name: string;
  ref: string;
  version: string;
  serviceConfig: BSBServiceConfig<any> | null;
  plugin: ClassType;
  pluginCWD: string;
  pluginPath: string;
}
