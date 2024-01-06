import {
  LoggingConfig,
  EventsConfig,
  PluginDefition as ServiceConfig,
} from "../../";

export interface DeploymentProfile {
  /**
   * @name NPM Package name
   * @description The NPM package that holds the plugin
   * @example @bettercorp/service-base-plugin-web-server
   * @example @bettercorp/service-base-plugin-graphql
   */
  package: string;
  /**
   * @name NPM Package version
   * @description The NPM package version that holds the plugin
   * @example 1.0.0
   * @example 1.0.1
   */
  //version: string;
  /**
   * @name Plugin name
   * @description The name of the plugin
   * @example service-fastify
   * @example service-graphql
   * @example logging-graylog
   */
  plugin: string;
  /**
   * @name Plugin enabled
   * @description If the plugin is enabled or not
   * @example true
   * @example false
   */
  enabled: boolean;
}

/**
 * @name Plugin name
 * @description The name of the plugin
 * @example service-fastify
 */
export type PluginName = string;

/**
 * @name Deployment profile name
 * @description The name of the deployment profile
 * @example default
 * @example server1
 * @example frontend
 * @example backend
 */
export type DeploymentProfileName = string;

export interface DeploymentProfiles<T> extends Record<string, T> {
  /**
   * @name Default deployment profile
   * @description The default deployment profile
   */
  default: T;
}
export interface ExtendedConfig {
  config: any | undefined;
}
export interface ConfigProfile {
  logging: Record<PluginName, LoggingConfig & ExtendedConfig>;
  events: Record<PluginName, EventsConfig & ExtendedConfig>;
  services: Record<PluginName, ServiceConfig & ExtendedConfig>;
}
export interface DefaultProfile {
  default: ConfigProfile;
}
export interface ConfigDefinition
  extends Record<string, ConfigProfile>,
    DefaultProfile {}

// export interface PluginConfig<INCLCONF extends boolean> {
//   package?: string | null;
//   plugin: string;
//   name: string;
//   enabled: boolean;
//   config: INCLCONF extends true ? any : never;
// }
