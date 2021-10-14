import { IDictionary } from "@bettercorp/tools/lib/Interfaces";
import { Tools } from "@bettercorp/tools/lib/Tools";

export interface IPluginLogger {
  info(...data: any[]): Promise<void>;
  warn(...data: any[]): Promise<void>;
  error(...data: any[]): Promise<void>;
  fatal(...data: any[]): Promise<void>;
  debug(...data: any[]): Promise<void>;
}

export interface ILogger {
  init?(): Promise<void>;
  info(plugin: string, ...data: any[]): Promise<void>;
  warn(plugin: string, ...data: any[]): Promise<void>;
  error(plugin: string, ...data: any[]): Promise<void>;
  fatal(plugin: string, ...data: any[]): Promise<void>;
  debug(plugin: string, ...data: any[]): Promise<void>;
}

export interface IPluginConfig { }

export class CLogger<PluginConfigType extends IPluginConfig = any> implements ILogger {
  pluginName: string;
  log: IPluginLogger;
  cwd: string;
  appConfig: IConfig;
  async getPluginConfig<T extends PluginConfigType = any>(pluginName?: string): Promise<PluginConfigType> {
    return this.appConfig.getPluginConfig<T>(pluginName || this.pluginName);
  }

  constructor(pluginName: string, cwd: string, log: IPluginLogger, appConfig: IConfig) {
    this.pluginName = pluginName;
    this.cwd = cwd;
    this.log = log;
    this.appConfig = appConfig;
  }

  async info(plugin: string, ...data: any[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async warn(plugin: string, ...data: any[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async error(plugin: string, ...data: any[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async fatal(plugin: string, ...data: any[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async debug(plugin: string, ...data: any[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
}

export interface IEvents<DefaultDataType = any, DefaultReturnType = void> {
  init?(): Promise<void>;
  log?: IPluginLogger;
  onEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, listener: (data: ArgsDataType) => void): Promise<void>;
  onReturnableEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, listener: (resolve: Function, reject: Function, data: ArgsDataType) => void): Promise<void>;
  emitEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType): Promise<void>;
  emitEventAndReturn<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType>;
}

export class CEvents<PluginConfigType extends IPluginConfig = any, DefaultDataType = any, DefaultReturnType = void> implements IEvents {
  pluginName: string;
  log: IPluginLogger;
  cwd: string;
  appConfig: IConfig;
  async getPluginConfig<T extends PluginConfigType = any>(pluginName?: string): Promise<PluginConfigType> {
    return this.appConfig.getPluginConfig<T>(pluginName || this.pluginName);
  }

  constructor(pluginName: string, cwd: string, log: IPluginLogger, appConfig: IConfig) {
    this.pluginName = pluginName;
    this.cwd = cwd;
    this.log = log;
    this.appConfig = appConfig;
  }

  async onEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, listener: (data: ArgsDataType) => void): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async onReturnableEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, listener: (resolve: Function, reject: Function, data: ArgsDataType) => void): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async emitEvent<ArgsDataType = DefaultDataType>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async emitEventAndReturn<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(callerPluginName: string, pluginName: string, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType> {
    throw new Error("Method not implemented.");
  }
}

export interface IPlugin<DefaultDataType = any, DefaultReturnType = void> {
  initIndex?: number;
  init?(): Promise<void>;
  loadedIndex?: number;
  loaded?(): Promise<void>;

  onEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, listener: (data: ArgsDataType) => void): Promise<void>;
  onReturnableEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, listener: (resolve: Function, reject: Function, data: ArgsDataType) => void): Promise<void>;
  emitEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, data?: ArgsDataType): Promise<void>;
  emitEventAndReturn<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(pluginName: string | null, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType>;
  initForPlugins?<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(pluginName: string, initType: string | null, ...args: Array<ArgsDataType>): Promise<ReturnDataType>;
}

export class CPlugin<PluginConfigType extends IPluginConfig = any, DefaultDataType = any, DefaultReturnType = void> implements IPlugin {
  initIndex?: number;
  loadedIndex?: number;

  pluginName: string;
  log: IPluginLogger;
  cwd: string;
  appConfig: IConfig;
  async getPluginConfig<T extends PluginConfigType = any>(pluginName?: string): Promise<PluginConfigType> {
    return this.appConfig.getPluginConfig<T>(pluginName || this.pluginName);
  }

  constructor(pluginName: string, cwd: string, log: IPluginLogger, appConfig: IConfig) {
    if (Tools.isNullOrUndefined(this.initIndex))
      this.initIndex = -1;
    if (Tools.isNullOrUndefined(this.loadedIndex))
      this.loadedIndex = 1;
    this.pluginName = pluginName;
    this.cwd = cwd;
    this.log = log;
    this.appConfig = appConfig;
  }
  async onEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, listener: (data: ArgsDataType) => void): Promise<void> {
    throw new Error("BSB INIT ERROR");
  }
  async onReturnableEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, listener: (resolve: Function, reject: Function, data: ArgsDataType) => void): Promise<void> {
    throw new Error("BSB INIT ERROR");
  }
  async emitEvent<ArgsDataType = DefaultDataType>(pluginName: string | null, event: string, data?: ArgsDataType): Promise<void> {
    throw new Error("BSB INIT ERROR");
  }
  async emitEventAndReturn<ArgsDataType = DefaultDataType, ReturnDataType = DefaultReturnType>(pluginName: string | null, event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType> {
    throw new Error("BSB INIT ERROR");
  }

}


export class CPluginClient<T> {
  public readonly _pluginName: string | undefined;
  public async pluginName(): Promise<string> {
    return this.refPlugin.appConfig.getMappedPluginName(this._pluginName!);
  }
  public refPlugin: CPlugin;

  constructor(self: IPlugin) {
    this.refPlugin = self as CPlugin;
  }

  async getPluginConfig(): Promise<T> {
    return this.refPlugin.getPluginConfig<T>(await this.pluginName());
  }

  async onEvent<ArgsDataType = any>(event: string, listener: (data: ArgsDataType) => void): Promise<void> {
    this.refPlugin.onEvent<ArgsDataType>(this._pluginName!, event, listener);
  }
  async onReturnableEvent<ArgsDataType = any>(event: string, listener: (resolve: Function, reject: Function, data: ArgsDataType) => void): Promise<void> {
    this.refPlugin.onReturnableEvent<ArgsDataType>(this._pluginName!, event, listener);
  }
  async emitEvent<T = any>(event: string, data?: T): Promise<void> {
    this.refPlugin.emitEvent<T>(this._pluginName!, event, data);
  }
  async emitEventAndReturn<ArgsDataType = any, ReturnDataType = void>(event: string, data?: ArgsDataType, timeoutSeconds?: number): Promise<ReturnDataType> {
    return this.refPlugin.emitEventAndReturn<ArgsDataType, ReturnDataType>(this._pluginName!, event, data, timeoutSeconds);
  }
  async initForPlugins<ArgsDataType = any, ReturnDataType = void>(initType: string, ...args: Array<ArgsDataType>): Promise<ReturnDataType> {
    return (this.refPlugin as IPlugin).initForPlugins!<ArgsDataType, ReturnDataType>(this._pluginName!, initType, ...args);
  }
}

export interface DeploymentProfiles<T> extends IDictionary<T> {
  default: T;
}
export interface ServiceConfig {
  plugins: IDictionary<IPluginConfig>;
  deploymentProfiles: DeploymentProfiles<DeploymentProfile>;
}

export interface DeploymentProfile {
  mappedName: string;
  enabled: boolean;
}

export enum IPluginDefinition {
  config = "config",
  events = "events",
  logging = "logging",
  normal = "normal"
}

export interface IReadyPlugin {
  pluginDefinition: IPluginDefinition;
  name: string;
  version: string;
  pluginFile: string;
  installerFile: string | null;
}

export interface IConfig {
  get runningInDebug(): boolean;
  get runningLive(): boolean;
  get deploymentProfile(): string;
  get activeDeploymentProfile(): DeploymentProfiles<DeploymentProfile>;

  getPluginConfig<T extends IPluginConfig>(pluginName: string): Promise<T>;
  getPluginDeploymentProfile(pluginName: string): Promise<DeploymentProfile>;
  getMappedPluginName(pluginName: string): Promise<string>;
  getPluginState(pluginName: string): Promise<boolean>;

  refreshAppConfig(): Promise<void>;
  updateAppConfig(pluginName?: string, mappedPluginName?: string, config?: IPluginConfig): Promise<void>;
}

export class CConfig implements IConfig {
  readonly _defaultLogger: IPluginLogger;
  readonly _deploymentProfile: string;
  constructor(logger: IPluginLogger, cwd: string, deploymentProfile: string) {
    this._defaultLogger = logger;
    this._deploymentProfile = deploymentProfile;
  }
  async refreshAppConfig(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async updateAppConfig(pluginName?: string, mappedPluginName?: string, config?: IPluginConfig): Promise<void> {
    throw new Error('Method not implemented.');
  }
  async getPluginConfig<T extends IPluginConfig>(pluginName: string): Promise<T> {
    throw new Error('Method not implemented.');
  }
  public async getPluginDeploymentProfile(pluginName: string): Promise<DeploymentProfile> {
    return this.activeDeploymentProfile[pluginName!];
  }
  public async getMappedPluginName(pluginName: string): Promise<string> {
    if (Tools.isNullOrUndefined(this.getPluginDeploymentProfile(pluginName))) return pluginName;
    return (await this.getPluginDeploymentProfile(pluginName)).mappedName || pluginName;
  }
  public async getPluginState(pluginName: string): Promise<boolean> {
    return (await this.getPluginDeploymentProfile(pluginName)).enabled;
  }
  get runningInDebug(): boolean {
    throw new Error('Method not implemented.');
  }
  get runningLive(): boolean {
    throw new Error('Method not implemented.');
  }
  get deploymentProfile(): string {
    return this._deploymentProfile;
  }
  get activeDeploymentProfile(): DeploymentProfiles<DeploymentProfile> {
    throw new Error('Method not implemented.');
  }
}