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

/**
 * Result pattern for better error handling without exceptions
 * 
 * @group Errors
 * @category Core
 */
export type Result<T, E = Error> = 
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: E };

/**
 * Creates a successful result
 * 
 * @param data - The successful data
 * @returns Success result
 * 
 * @group Errors
 * @category Utilities
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/Ok.html | API: Ok}
 */
export function Ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Creates a failed result
 * 
 * @param error - The error that occurred
 * @returns Failed result
 * 
 * @group Errors
 * @category Utilities
 */
export function Err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Maps a Result's success value to a new value
 * 
 * @param result - The result to map
 * @param fn - Function to transform the success value
 * @returns New result with transformed value
 * 
 * @group Errors
 * @category Utilities
 */
export function mapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (result.success) {
    return Ok(fn(result.data));
  }
  return result;
}

/**
 * Maps a Result's error value to a new error
 * 
 * @param result - The result to map
 * @param fn - Function to transform the error value
 * @returns New result with transformed error
 * 
 * @group Errors
 * @category Utilities
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/mapError.html | API: mapError}
 */
export function mapError<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (!result.success) {
    return Err(fn(result.error));
  }
  return result;
}

/**
 * Chains multiple operations that return Results
 * 
 * @param result - The initial result
 * @param fn - Function that takes success value and returns new Result
 * @returns Chained result
 * 
 * @group Errors
 * @category Utilities
 */
export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.success) {
    return fn(result.data);
  }
  return result;
}

/**
 * Unwraps a Result, throwing the error if it failed
 * 
 * @param result - The result to unwrap
 * @returns The success value
 * @throws The error if result failed
 * 
 * @group Errors
 * @category Utilities
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.success) {
    return result.data;
  }
  throw result.error;
}

/**
 * Unwraps a Result, returning a default value if it failed
 * 
 * @param result - The result to unwrap
 * @param defaultValue - Value to return if result failed
 * @returns The success value or default value
 * 
 * @group Errors
 * @category Utilities
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.success) {
    return result.data;
  }
  return defaultValue;
}

/**
 * Converts a promise that might throw to a Result
 * 
 * @param promise - Promise that might throw
 * @returns Promise that resolves to a Result
 * 
 * @group Errors
 * @category Utilities
 * @see {@link https://bsbcode.dev/languages/nodejs/types/functions/fromPromise.html | API: fromPromise}
 */
export async function fromPromise<T>(promise: Promise<T>): Promise<Result<T, Error>> {
  try {
    const data = await promise;
    return Ok(data);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

