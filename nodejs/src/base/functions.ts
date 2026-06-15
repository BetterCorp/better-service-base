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

import { createFakeDTrace, DTrace } from '../interfaces/metrics.js';
import { BSBError } from "./errorMessages.js";
import * as av from 'anyvali';

/**
 * @hidden
 */
function internalTrace(span: string): DTrace {
  return createFakeDTrace("base/functions", span);
}


type SmartFunctionCallFunc = {
  [Symbol.toStringTag]?: string;
  (...args: any[]): any;
};

/**
 * initializes a function call and calls it with context but shows as the function type (async/sync)
 * @group Functions
 * @category Tools
 * @param context - the context to call the function with
 * @param input - the function to call
 * @param params - the parameters to pass to the function
 * @returns Async/Sync called function return type or immediately if the input is not a function
 * @throws BSBError context is not an object
 *
 * @example
 * ```ts
 * const myFunc = async (a: string, b: number) => {
 *   console.log("called with " + a + " and " + b);
 * };
 * console.log("done with " + (await SmartFunctionCallThroughAsync(this, myFunc, "a", 5)));
 * ```
 * @example
 * ```ts
 * const myFunc = (a: string, b: number) => {
 *   console.log("called with " + a + " and " + b);
 * };
 * console.log("done with " + SmartFunctionCallThroughAsync(this, myFunc, "a", 5));
 * ```
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/SmartFunctionCallThroughAsync.html | API: SmartFunctionCallThroughAsync}
 */
export function SmartFunctionCallThroughAsync<T extends SmartFunctionCallFunc>(
  trace: DTrace,
  context: any,
  input: T | undefined,
  ...params: Parameters<T>
): Promise<ReturnType<T> | void> | ReturnType<T> | void {
  if (typeof input !== "function") return;
  if (typeof context !== "object") {
    throw new BSBError(trace,
      "SmartFunctionCallThroughAsync: context is not an object",
    );
  }
  return input.call(context, ...params);
}

/**
 * Initializes a function call and calls it with context but shows as the function type (async)
 * @group Functions
 * @category Tools
 * @param trace - the trace to use
 * @param context - the context to call the function with
 * @param input - the function to call
 * @param params - the parameters to pass to the function
 * @returns Async called function return type or immediately if the input is not a function
 * @throws BSBError context is not an object
 *
 * @example
 * ```ts
 * const myFunc = async (a: string, b: number) => {
 *   console.log("called with " + a + " and " + b);
 * };
 * console.log("done with " + await SmartFunctionCallAsync(this, myFunc, "a", 5));
 * ```
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/SmartFunctionCallAsync.html | API: SmartFunctionCallAsync}
 */
export async function SmartFunctionCallAsync<T extends SmartFunctionCallFunc>(
  context: any,
  input: T | undefined,
  ...params: Parameters<T>
): Promise<ReturnType<T> | void> {
  if (typeof input !== "function") return;
  if (typeof context !== "object") {
    throw new BSBError(internalTrace("SmartFunctionCallAsync"),
      "SmartFunctionCallAsync: context is not an object",
    );
  }
  if (input[Symbol.toStringTag] === "AsyncFunction") {
    return await input.call(context, ...params);
  }
  return input.call(context, ...params);
}

/**
 * initializes a function call and calls it with context but shows as the function type (sync)
 * @group Functions
 * @category Tools
 * @param context
 * @param input
 * @param params
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/SmartFunctionCallSync.html | API: SmartFunctionCallSync}
 */
export function SmartFunctionCallSync<T extends SmartFunctionCallFunc>(
  context: any,
  input: T | undefined,
  ...params: Parameters<T>
): ReturnType<T> | void {
  if (typeof input !== "function") return;
  if (typeof context !== "object") {
    throw new BSBError(internalTrace("SmartFunctionCallSync"),
      "SmartFunctionCallSync: context is not an object",
    );
  }
  return input.call(context, ...params);
}

/**
 * Validated environment properties for the BSB runtime.
 *
 * Use {@link getEnvProps} to read and validate the current process env.
 *
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#ENV_PROPS | API: ENV_PROPS}
 */
export const ENV_PROPS = av.object({
  /** Active configuration profile (e.g. "default", "prod") */
  BSB_PROFILE: av.optional(av.string()).default("default").describe('Active configuration profile name'),
  /** Path to the root config file when not using plugin-based sources */
  BSB_CONFIG_FILE: av.optional(av.string()).default("config.yaml").describe('Path to the root config file when not using plugin-based sources'),
  /** Application working directory */
  APP_DIR: av.optional(av.string()).default(process.cwd()).describe('Application working directory'),
  /** Logger plugin name to load */
  BSB_LOGGER_PLUGIN: av.optional(av.string()).default("config-default").describe('Logger plugin name to load'),
  /** Logger plugin package (if different from name) */
  BSB_LOGGER_PLUGIN_PACKAGE: av.optional(av.string()).default("config-default").describe('Logger plugin package when different from the plugin name'),
}, { unknownKeys: 'strip' }).describe('Validated BSB runtime environment properties');

/**
 * Parse and validate the current environment against {@link ENV_PROPS}.
 *
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/getEnvProps.html | API: getEnvProps}
 */
export function getEnvProps() {
  return ENV_PROPS.parse(process.env);
}
