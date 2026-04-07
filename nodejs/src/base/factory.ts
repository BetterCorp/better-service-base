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

import { v7 as randomUUID } from "uuid";
import { hostname } from "node:os";
import { BSBOptions, ResolvedBSBOptions, SimpleBSBOptions, BSBPreset, DEBUG_MODE, BSBRuntimeMode } from "../interfaces/index.js";
import { SBConfig } from "../serviceBase/config.js";
import { SBPlugins } from "../serviceBase/plugins.js";
import { SBObservable } from "../serviceBase/observable.js";
import { SBEvents } from "../serviceBase/events.js";
import { SBServices } from "../serviceBase/services.js";

/**
 * Resolves BSB options with defaults
 * 
 * @param options - User provided options
 * @returns Resolved options with all defaults applied
 * 
 * @group Main
 * @category Factory
 */
export function resolveBSBOptions(options: BSBOptions = {}): ResolvedBSBOptions {
  const {
    debug = true,
    live = false,
    cwd = process.cwd(),
    appId,
    region,
    runtimeMode,
    config = SBConfig,
    plugins = SBPlugins,
    observable = SBObservable,
    events = SBEvents,
    services = SBServices
  } = options;

  // Determine debug mode
  let mode: DEBUG_MODE;
  if (live === false) {
    mode = "development";
  } else if (debug === true) {
    mode = "production-debug";
  } else {
    mode = "production";
  }

  const resolvedRuntimeMode: BSBRuntimeMode = runtimeMode ?? (live ? "prod" : "dev");

  // Generate app ID if not provided
  let resolvedAppId: string;
  if (appId) {
    resolvedAppId = appId;
  } else if (typeof process.env.BSB_APP_ID === "string" && process.env.BSB_APP_ID.length > 2) {
    resolvedAppId = process.env.BSB_APP_ID;
  } else {
    resolvedAppId = `${hostname()}-${randomUUID()}`;
  }

  // Resolve region from option → env → undefined
  let resolvedRegion: string | undefined;
  if (region) {
    resolvedRegion = region;
  } else if (typeof process.env.BSB_REGION === "string" && process.env.BSB_REGION.length > 0) {
    resolvedRegion = process.env.BSB_REGION;
  } else {
    resolvedRegion = undefined;
  }

  return {
    debug,
    live,
    cwd,
    appId: resolvedAppId,
    region: resolvedRegion,
    mode,
    runtimeMode: resolvedRuntimeMode,
    config,
    plugins,
    observable,
    events,
    services
  };
}

/**
 * Creates BSBOptions from simple configuration
 * 
 * @param simple - Simple configuration options
 * @returns BSBOptions for ServiceBase
 * 
 * @group Main
 * @category Factory
 */
export function fromSimpleOptions(simple: SimpleBSBOptions = {}): BSBOptions {
  const {
    cwd = process.cwd(),
    debug = process.env.NODE_ENV !== "production"
  } = simple;

  // TODO: Handle config file loading and plugin list processing
  // This would need integration with the config system
  
  return {
    debug,
    cwd,
    live: process.env.NODE_ENV === "production"
  };
}

/**
 * Creates BSBOptions from preset configuration
 * 
 * @param preset - Preset type
 * @param overrides - Additional options to override preset defaults
 * @returns BSBOptions for ServiceBase
 * 
 * @group Main
 * @category Factory
 */
export function fromPreset(preset: BSBPreset, overrides: Partial<BSBOptions> = {}): BSBOptions {
  let baseOptions: BSBOptions;

  switch (preset) {
    case BSBPreset.MINIMAL:
      baseOptions = {
        debug: false,
        live: true,
        cwd: process.cwd()
      };
      break;

    case BSBPreset.DEVELOPMENT:
      baseOptions = {
        debug: true,
        live: false,
        cwd: process.cwd()
      };
      break;

    case BSBPreset.PRODUCTION:
      baseOptions = {
        debug: false,
        live: true,
        cwd: process.cwd()
      };
      break;

    case BSBPreset.TESTING:
      baseOptions = {
        debug: true,
        live: false,
        cwd: process.cwd()
        // TODO: Add mock implementations for testing
      };
      break;

    default:
      throw new Error(`Unknown preset: ${preset}`);
  }

  return {
    ...baseOptions,
    ...overrides
  };
}
