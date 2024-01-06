import { EventEmitter } from "events";
import { IPluginLogger } from "../../../";

export class broadcast extends EventEmitter {
  private log: IPluginLogger;

  constructor(log: IPluginLogger) {
    super();
    this.log = log;
  }
  public dispose() {
    this.removeAllListeners();
  }

  public async onBroadcast(
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void> {
    this.log.debug("onBroadcast:listening to {pluginName}-{event}", {
      pluginName,
      event,
    });
    this.on(`${pluginName}-${event}`, listener);
  }

  public async emitBroadcast(
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void> {
    this.log.debug("emitBroadcast: emitting {pluginName}-{event}", {
      pluginName,
      event,
    });
    this.emit(`${pluginName}-${event}`, args);
  }
}
