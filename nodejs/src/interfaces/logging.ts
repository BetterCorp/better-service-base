import { ParamsFromString } from "@bettercorp/tools/lib/Interfaces";

export type DEBUG_MODE = "production" | "production-debug" | "development";

export type SafeLogData =
  | string
  | number
  | boolean
  | Array<string | number | boolean>
  | Object;
export type UnsafeLogData = {
  value: string | number | boolean | Array<string | number | boolean> | Object; // Unsafe and unsanitized data
  safeValue: SafeLogData; // Safe and sanitized data
}; // Data can contain sensitive information

export type LogMeta<T extends string> = Record<
  ParamsFromString<T>,
  UnsafeLogData | SafeLogData
>;

/**
 * If you are going to make an object or something, use LogMeta instead.
 */
export type SmartLogMeta<T extends string> = ParamsFromString<T> extends never
  ? [undefined?]
  : [meta: Record<ParamsFromString<T>, UnsafeLogData | SafeLogData>];

export interface IPluginLogger {
  reportStat(key: string, value: number): void;
  reportTextStat<T extends string>(message: T, ...meta: SmartLogMeta<T>): void;
  info<T extends string>(message: T, ...meta: SmartLogMeta<T>): void;
  warn<T extends string>(message: T, ...meta: SmartLogMeta<T>): void;
  debug<T extends string>(message: T, ...meta: SmartLogMeta<T>): void;
  error<T extends string>(message: T, ...meta: SmartLogMeta<T>): void;
}

export const LoggingEventTypesBase = {
  reportStat: "reportStat",
  reportTextStat: "reportTextStat",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
} as const;
export type LoggingEventTypesExlReportStat = Exclude<
  LoggingEventTypes,
  "reportStat"
>;
export type LoggingEventTypes =
  (typeof LoggingEventTypesBase)[keyof typeof LoggingEventTypesBase];
