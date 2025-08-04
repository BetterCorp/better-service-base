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

import { createFakeDTrace, DTrace } from '../interfaces/metrics';
import { BSBError } from "./errorMessages";
import { z } from "zod";

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

export const ENV_PROPS = z.object({
  BSB_PROFILE: z.string().optional().default("default"),
  BSB_CONFIG_FILE: z.string().optional().default("config.yaml"),
  APP_DIR: z.string().optional().default(process.cwd()),
  BSB_LOGGER_PLUGIN: z.string().optional().default("config-default"),
  BSB_LOGGER_PLUGIN_PACKAGE: z.string().optional().default("config-default"),
});
export function getEnvProps() {
  return ENV_PROPS.parse(process.env);
}
