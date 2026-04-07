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
  ObservableConfig,
  EventsConfig,
  PluginDefinition as ServiceConfig,
} from "../../index.js";

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
   * @example 1.2
   * @example 1.2.3
   */
  version?: string;
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
  observable: Record<PluginName, ObservableConfig & ExtendedConfig>;
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
