// THIS FILE IS SUBJECT TO COPYRIGHT FROM THE SOURCE - https://github.com/BetterCorp/Node-Tools.git 
// @bettercorp/tools

import {createHash, randomBytes} from "node:crypto";

/**
 * @hidden
 */
export interface MergeObjectsKey {
  refPropName: string;
  refPropKey: string;
}

/**
 * @hidden
 */
export interface SimpleStatu<T = any> {
  status: boolean;
  value?: T;
}

/**
 * @hidden
 */
export type DynamicallyReferencedType = Record<string, Function>;
/**
 * @hidden
 */
export type DynamicallyReferencedMethodBase = DynamicallyReferencedType;
/**
 * @hidden
 */
export type DynamicallyReferencedMethodType<T> = T & DynamicallyReferencedMethodBase;

/**
 * @hidden
 */
// from: https://stackoverflow.com/a/73394054/8083582
export type ParamsFromString<T extends string> =
// Check if this string includes a param, and infer the param name,
// as well as the string before and after
    T extends `${infer Pre}{${infer Param}}${infer Post}`
        ? // A param exists in the string, so return it as a union type that
        // includes all other params in the string with this param removed.
        Param | ParamsFromString<`${Pre}${Post}`>
        : // No params exist in these string, so return never.
        never;

/**
 * @hidden
 */
export type DynamicallyReferencedMethod<
    Interface extends DynamicallyReferencedType,
    Method extends string,
    ArgsReference extends boolean = true
> = ArgsReference extends true
    ? // If this DRM was called via the arguments of the method, then we return the args array
    Interface[Method] extends (...a: infer Arguments) => infer Return
        ? // If the method actually exists, we return the original argument (method) plus all additional arguments
        [method: Method, ...a: Arguments]
        : // No method is known, so we just define the default argument (method) and an argument that will never be valid to cause typescript to error
        [method: Method, noMatchingMethod: never]
    : // For the return properties we do the same method check
    Interface[Method] extends (...a: infer Arguments) => infer Return
        ? // If the method exists, we return the methods return information
        Return
        : // Else we return a never as it doesn't exist
        never;

/**
 * @hidden
 */
export enum CleanStringStrength {
  soft = "soft",
  hard = "hard",
  exhard = "exhard",
  url = "url",
  ip = "ip",
  email = "email",
  custom = "custom"
}

/**
 * @hidden
 */
export function generateAppIdHash(appId: string) {
  const hash = createHash('sha256').update(appId).digest('hex');
  return hash.slice(0, 2); // Take the first 2 characters of the hash
}

/**
 * @hidden
 */
export function generateTimeBasedId(byteLength: number, appId: string) {
  // Get current timestamp in milliseconds
  const timestamp = BigInt(Date.now());
  // Convert timestamp to hexadecimal and pad to 10 characters (40 bits)
  const timeHex = timestamp.toString(16).padStart(10, '0');
  // Generate 2-character hash from appId
  const appIdHash = generateAppIdHash(appId);
  // Calculate how many bytes we need to fill with random data
  const randomBytesLength = byteLength - 6; // 5 bytes for timestamp, 1 byte for appId hash
  // Generate random bytes
  const randomHex = randomBytes(randomBytesLength).toString('hex');
  // Combine timestamp, appId hash, and random data
  return timeHex + appIdHash + randomHex;
}

/**
 * @hidden
 */
export const DEBUG_MODE = process.env.NODE_ENV !== "production";
