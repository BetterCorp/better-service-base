import { IPluginConfig } from "./config";
import { IPluginLogger } from "./logger";
import { ErrorMessages } from "./static";

export class DefaultBase<PluginConfigType extends IPluginConfig = any> {
  protected readonly runningDebug: boolean = true;
  protected readonly runningLive: boolean = false;
  public readonly pluginName: string;
  public log: IPluginLogger;
  protected cwd: string;

  protected getPluginConfig(): Promise<PluginConfigType> {
    throw ErrorMessages.BSBNotInit;
  }
  protected async getPluginState(): Promise<boolean> {
    throw ErrorMessages.BSBNotInit;
  }

  constructor(pluginName: string, cwd: string, log: IPluginLogger) {
    this.pluginName = pluginName;
    this.cwd = cwd;
    this.log = log;
  }
}
