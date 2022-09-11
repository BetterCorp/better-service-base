import { ParamsFromString } from "@bettercorp/tools/lib/Interfaces";

export type LogMeta<T extends string> = Record<
  ParamsFromString<T>,
  string | number | boolean | Array<string | number | boolean>
>;

export interface IPluginLogger {
  reportStat(key: string, value: number): Promise<void>;
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
  debug<T extends string>(
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
  error<T extends string>(
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
  error(error: Error): Promise<void>;
  fatal<T extends string>(
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
  fatal(error: Error): Promise<void>;
}

export interface ILogger {
  init?(): Promise<void>;
  reportStat(plugin: string, key: string, value: number): Promise<void>;
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
  error(plugin: string, error: Error): Promise<void>;
  debug<T extends string>(
    plugin: string,
    message: T,
    meta?: LogMeta<T>,
    hasPIData?: boolean
  ): Promise<void>;
}
