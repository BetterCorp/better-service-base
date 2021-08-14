import { IDictionary } from "@bettercorp/tools/lib/Interfaces";
import { Tools } from "@bettercorp/tools/lib/Tools";
import { AppConfig } from "./AppConfig";

export interface IPluginLogger {
  info(...data: any[]): void;
  warn(...data: any[]): void;
  error(...data: any[]): void;
  fatal(...data: any[]): void;
  debug(...data: any[]): void;
}

export interface ILogger {
  init?(): Promise<void>;
  info(plugin: string, ...data: any[]): void;
  warn(plugin: string, ...data: any[]): void;
  error(plugin: string, ...data: any[]): void;
  fatal(plugin: string, ...data: any[]): void;
  debug(plugin: string, ...data: any[]): void;
}

export interface IPluginConfig { }

export class CLogger<PluginConfigType extends IPluginConfig = any> implements ILogger {
  pluginName: string;
  log: IPluginLogger;
  cwd: string;
  appConfig: AppConfig;
  getPluginConfig<T extends PluginConfigType = any>(pluginName?: string): PluginConfigType {
    return this.appConfig.getPluginConfig<T>(pluginName || this.pluginName);
  }

  constructor(pluginName: string, cwd: string, log: IPluginLogger, appConfig: AppConfig) {
    this.pluginName = pluginName;
    this.cwd = cwd;
    this.log = log;
    this.appConfig = appConfig;
  }

  info(plugin: string, ...data: any[]): void {
    throw new Error("Method not implemented.");
  }
  warn(plugin: string, ...data: any[]): void {
    throw new Error("Method not implemented.");
  }
  error(plugin: string, ...data: any[]): void {
    throw new Error("Method not implemented.");
  }
  fatal(plugin: string, ...data: any[]): void {
    throw new Error("Method not implemented.");
  }
  debug(plugin: string, ...data: any[]): void {
    throw new Error("Method not implemented.");
  }
}

export interface IEvents<DefaultDataType = any, DefaultReturnType = void> {
  init?(): Promise<void>;
  log?: IPluginLogger;
  onEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, listener: (data: ArgsDataType) => void): void;
  onReturnableEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, listener: (resolve: Function, reject: Function, data: ArgsDataType) => void): void;
  emitEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType): void;
  emitEventAndReturn<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType>;
}

export class CEvents<PluginConfigType extends IPluginConfig = any, DefaultDataType = any, DefaultReturnType = void> implements IEvents {
  pluginName: string;
  log: IPluginLogger;
  cwd: string;
  appConfig: AppConfig;
  getPluginConfig<T extends PluginConfigType = any>(pluginName?: string): PluginConfigType {
    return this.appConfig.getPluginConfig<T>(pluginName || this.pluginName);
  }

  constructor(pluginName: string, cwd: string, log: IPluginLogger, appConfig: AppConfig) {
    this.pluginName = pluginName;
    this.cwd = cwd;
    this.log = log;
    this.appConfig = appConfig;
  }

  onEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, listener: (data: ArgsDataType) => void): void {
    throw new Error("Method not implemented.");
  }
  onReturnableEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, listener: (resolve: Function, reject: Function, data: ArgsDataType) => void): void {
    throw new Error("Method not implemented.");
  }
  emitEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType): void {
    throw new Error("Method not implemented.");
  }
  emitEventAndReturn<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType> {
    throw new Error("Method not implemented.");
  }
}

export interface IPlugin<DefaultDataType = any, DefaultReturnType = void> {
  initIndex?: number;
  init?(): Promise<void>;
  loadedIndex?: number;
  loaded?(): Promise<void>;

  onEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, listener: (data: ArgsDataType) => void): void;
  onReturnableEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, listener: (resolve: Function, reject: Function, data: ArgsDataType) => void): void;
  emitEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, data?: ArgsDataType): void;
  emitEventAndReturn<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(pluginName: string | null, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType>;
  initForPlugins?<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(pluginName: string, initType: string | null, ...args: Array<ArgsDataType>): Promise<ReturnDataType>;
}

export class CPlugin<PluginConfigType extends IPluginConfig = any, DefaultDataType = any, DefaultReturnType = void> implements IPlugin {
  initIndex?: number;
  loadedIndex?: number;

  pluginName: string;
  log: IPluginLogger;
  cwd: string;
  appConfig: AppConfig;
  getPluginConfig<T extends PluginConfigType = any>(pluginName?: string): PluginConfigType {
    return this.appConfig.getPluginConfig<T>(pluginName || this.pluginName);
  }

  constructor(pluginName: string, cwd: string, log: IPluginLogger, appConfig: AppConfig) {
    if (Tools.isNullOrUndefined(this.initIndex))
      this.initIndex = -1;
    if (Tools.isNullOrUndefined(this.loadedIndex))
      this.loadedIndex = 1;
    this.pluginName = pluginName;
    this.cwd = cwd;
    this.log = log;
    this.appConfig = appConfig;
  }
  onEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, listener: (data: ArgsDataType) => void): void {
    throw new Error("BSB INIT ERROR");
  }
  onReturnableEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, listener: (resolve: Function, reject: Function, data: ArgsDataType) => void): void {
    throw new Error("BSB INIT ERROR");
  }
  emitEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, data?: ArgsDataType): void {
    throw new Error("BSB INIT ERROR");
  }
  emitEventAndReturn<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(pluginName: string | null, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType> {
    throw new Error("BSB INIT ERROR");
  }

}


export class CPluginClient<T> {
  public readonly _pluginName: string | undefined;
  public get pluginName(): string {
    return this.refPlugin.appConfig.getMappedPluginName(this._pluginName!);
  }
  public refPlugin: CPlugin;

  constructor(self: IPlugin) {
    this.refPlugin = self as CPlugin;
  }

  getPluginConfig(): T {
    return this.refPlugin.getPluginConfig<T>(this.pluginName);
  }

  onEvent<ArgsDataType = any>(event: string, listener: (data: ArgsDataType) => void): void {
    this.refPlugin.onEvent<ArgsDataType>(this._pluginName!, event, listener);
  }
  onReturnableEvent<ArgsDataType = any>(event: string, listener: (resolve: Function, reject: Function, data: ArgsDataType) => void): void {
    this.refPlugin.onReturnableEvent<ArgsDataType>(this._pluginName!, event, listener);
  }
  emitEvent<T = any>(event: string, data?: T): void {
    this.refPlugin.emitEvent<T>(this._pluginName!, event, data);
  }
  emitEventAndReturn<ArgsDataType = any, ReturnDataType = void>(event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType> {
    return this.refPlugin.emitEventAndReturn<ArgsDataType, ReturnDataType>(this._pluginName!, event, data, timeoutSeconds);
  }
  initForPlugins<ArgsDataType = any, ReturnDataType = void>(initType: string, ...args: Array<ArgsDataType>): Promise<ReturnDataType> {
    return (this.refPlugin as IPlugin).initForPlugins!<ArgsDataType, ReturnDataType>(this._pluginName!, initType, ...args);
  }
}

export interface DeploymentProfiles<T> extends IDictionary<T> {
  default: T;
}
export interface ServiceConfig {
  identity: string;
  debug: boolean;
  plugins: IDictionary<IPluginConfig>;
  deploymentProfiles: DeploymentProfiles<DeploymentProfile>;
}

export interface DeploymentProfile {
  mappedName: string;
  enabled: boolean;
}

export enum IPluginDefinition {
  events = "events",
  logging = "logging",
  normal = "normal"
}

export interface IReadyPlugin {
  name: string;
  version: string;
  pluginFile: string;
  installerFile: string | null;
}