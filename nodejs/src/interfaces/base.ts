import { IPluginConfig } from "./config";
import { IPluginLogger } from "./logger";
import { ErrorMessages } from "./static";

export interface FakeConfigBase<PluginConfigType extends IPluginConfig = any> {
  appId: string;
  runningDebug: boolean;
  runningLive: boolean;
  getPluginConfig(): Promise<PluginConfigType>;
  getPluginState(): Promise<boolean>;
}

export class DefaultBaseCore {
  protected readonly appId: string = "tbd";
  protected readonly runningDebug: boolean = true;
  protected readonly runningLive: boolean = false;
  public readonly pluginName: string;
  public log: IPluginLogger;
  protected cwd: string;
  protected pluginCwd: string;

  constructor(
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    log: IPluginLogger
  ) {
    this.pluginName = pluginName;
    this.cwd = cwd;
    this.pluginCwd = pluginCwd;
    this.log = log;
  }

  dispose() {}
  async init(): Promise<void> {}
}

export class DefaultBase<
  PluginConfigType extends IPluginConfig = any
> extends DefaultBaseCore {
  protected getPluginConfig(): Promise<PluginConfigType> {
    throw ErrorMessages.BSBNotInit;
  }
  protected async getPluginState(): Promise<boolean> {
    throw ErrorMessages.BSBNotInit;
  }
}
