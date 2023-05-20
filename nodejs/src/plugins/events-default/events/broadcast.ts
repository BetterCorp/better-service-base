import { EventEmitter } from "events";
import { IPluginLogger } from '../../../interfaces/logger';

export default class broadcast extends EventEmitter {
  private log: IPluginLogger;

  constructor(log: IPluginLogger) {
    super();
    this.log = log;
  }
  public dispose() {
    this.removeAllListeners();
  }

  public async onBroadcast(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void> {
    await this.log.debug(
      "onBroadcast: {callerPluginName} listening to {pluginName}-{event}",
      { callerPluginName, pluginName, event }
    );
    this.on(`${pluginName}-${event}`, listener);
  }

  public async emitBroadcast(
    callerPluginName: string,
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void> {
    await this.log.debug(
      "emitBroadcast: {callerPluginName} emitting {pluginName}-{event}",
      { callerPluginName, pluginName, event }
    );
    this.emit(`${pluginName}-${event}`, args);
  }
}
