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

import type { DEBUG_MODE } from "./logging";
import type { SBConfig } from "../serviceBase/config";
import type { SBPlugins } from "../serviceBase/plugins";
import type { SBObservable } from "../serviceBase/observable";
import type { SBEvents } from "../serviceBase/events";
import type { SBServices } from "../serviceBase/services";

/**
 * Configuration options for ServiceBase constructor
 * 
 * @group Main
 * @category Configuration
 * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/BSBOptions.html | API: BSBOptions}
 */
export interface BSBOptions {
  /**
   * Enable debug logging
   * @default true
   */
  debug?: boolean;

  /**
   * Disable development mode (affects plugin loading)
   * @default false
   */
  live?: boolean;

  /**
   * Current working directory
   * @default process.cwd()
   */
  cwd?: string;

  /**
   * Custom application ID (overrides auto-generated ID)
   * @default undefined (auto-generated from hostname + UUID)
   */
  appId?: string;

  /**
   * Deployment region for resource context
   * @default undefined (resolved from BSB_REGION env var)
   */
  region?: string;

  /**
   * Override default configuration handler
   * @default SBConfig
   */
  config?: typeof SBConfig;

  /**
   * Override default plugins handler
   * @default SBPlugins
   */
  plugins?: typeof SBPlugins;

  /**
   * Override default observable handler (unified logging, metrics, tracing)
   * @default SBObservable
   */
  observable?: typeof SBObservable;

  /**
   * Override default events handler
   * @default SBEvents
   */
  events?: typeof SBEvents;

  /**
   * Override default services handler
   * @default SBServices
   */
  services?: typeof SBServices;
}

/**
 * Resolved options with all defaults applied
 * 
 * @group Main
 * @category Configuration
 * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/ResolvedBSBOptions.html | API: ResolvedBSBOptions}
 */
export interface ResolvedBSBOptions {
  debug: boolean;
  live: boolean;
  cwd: string;
  appId: string;
  region?: string;
  mode: DEBUG_MODE;
  config: typeof SBConfig;
  plugins: typeof SBPlugins;
  observable: typeof SBObservable;
  events: typeof SBEvents;
  services: typeof SBServices;
}

/**
 * Simple configuration for common use cases
 * 
 * @group Main
 * @category Configuration
 * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/SimpleBSBOptions.html | API: SimpleBSBOptions}
 */
export interface SimpleBSBOptions {
  /**
   * Working directory
   * @default process.cwd()
   */
  cwd?: string;

  /**
   * Configuration file path or object
   */
  config?: string | object;

  /**
   * List of plugins to enable
   * @default ['observable-default', 'events-default']
   */
  plugins?: string[];

  /**
   * Debug mode
   * @default true in development, false in production
   */
  debug?: boolean;
}

/**
 * Factory preset configurations
 * 
 * @group Main
 * @category Configuration
 * @see {@link https://bsbcode.dev/languages/nodejs/types/interfaces/BSBPreset.html | API: BSBPreset}
 */
export enum BSBPreset {
  /**
   * Minimal setup with basic plugins
   */
  MINIMAL = "minimal",

  /**
   * Development setup with debug logging
   */
  DEVELOPMENT = "development",

  /**
   * Production setup with optimized settings
   */
  PRODUCTION = "production",

  /**
   * Testing setup with mocked components
   */
  TESTING = "testing"
}
