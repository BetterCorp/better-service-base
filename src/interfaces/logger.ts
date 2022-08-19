import { ParamsFromString } from "@bettercorp/tools/lib/Interfaces";

export type LogMeta<T extends string> = Record<ParamsFromString<T>, string>;

export interface IPluginLogger {
  info<T extends string>(
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
  warn<T extends string>(
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
  error<T extends string>(
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
  fatal<T extends string>(
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
  debug<T extends string>(
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
}

export interface ILogger {
  init?(): Promise<void>;
  info<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
  warn<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
  error<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
  fatal<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>
  ): Promise<void>;
  debug<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
}
