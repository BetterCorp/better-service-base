// import assert from "assert";
// import { IPluginLogger, LogMeta } from "../interfaces/logging";
// import { LoggerBase } from "../logger/logger";

// export class Logger extends LoggerBase<any> {
//   constructor(
//     pluginName: string,
//     cwd: string,
//     pluginCwd: string,
//     defaultLogger: IPluginLogger
//   ) {
//     super(pluginName, cwd, pluginCwd, defaultLogger);
//   }

//   public async reportStat(
//     plugin: string,
//     key: string,
//     value: number
//   ): Promise<void> {}
//   public async debug<T extends string>(
//     plugin: string,
//     message: T,
//     meta?: LogMeta<T>,
//     hasPIData?: boolean
//   ): Promise<void> {}
//   public async info<T extends string>(
//     plugin: string,
//     message: T,
//     meta?: LogMeta<T>,
//     hasPIData?: boolean
//   ): Promise<void> {}
//   public async warn<T extends string>(
//     plugin: string,
//     message: T,
//     meta?: LogMeta<T>,
//     hasPIData?: boolean
//   ): Promise<void> {}
//   public async error<T extends string>(
//     plugin: string,
//     message: T,
//     meta?: LogMeta<T>,
//     hasPIData?: boolean
//   ): Promise<void> {
//     assert.fail(new Error(message));
//   }
// }
