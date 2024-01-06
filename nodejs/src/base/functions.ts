import { BSBError } from "./index";

type SmartFunctionCallFunc = {
  [Symbol.toStringTag]?: string;
  (...args: any[]): any;
};
export async function SmartFunctionCallAsync<T extends SmartFunctionCallFunc>(
  context: any,
  input: T | undefined,
  ...params: Parameters<T>
): Promise<ReturnType<T> | void> {
  if (typeof input !== "function") return;
  if (typeof context !== "object")
    throw new BSBError(
      "INCORRECT_REFERENCE",
      "SmartFunctionCallAsync: context is not an object"
    );
  if (input[Symbol.toStringTag] === "AsyncFunction") {
    return await input.call(context, ...params);
  }
  return input.call(context, ...params);
}
export function SmartFunctionCallSync<T extends SmartFunctionCallFunc>(
  context: any,
  input: T | undefined,
  ...params: Parameters<T>
): ReturnType<T> | void {
  if (typeof input !== "function") return;
  if (typeof context !== "object")
    throw new BSBError(
      "INCORRECT_REFERENCE",
      "SmartFunctionCallSync: context is not an object"
    );
  return input.call(context, ...params);
}
