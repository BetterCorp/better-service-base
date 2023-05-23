import { EventEmitter } from "events";
import { IPluginLogger } from "../../../interfaces/logger";
import { randomUUID } from "crypto";

export default class emit extends EventEmitter {
  private log: IPluginLogger;
  private _lastReceivedMessageIds: Array<string> = [];
  private set lastReceivedMessageIds(value: string) {
    // remove after 50 messages
    if (this._lastReceivedMessageIds.length > 50) {
      this._lastReceivedMessageIds.shift();
    }
    this._lastReceivedMessageIds.push(value);
  }

  constructor(log: IPluginLogger) {
    super();
    this.log = log;
  }
  public dispose() {
    this.removeAllListeners();
  }

  public async onEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<void> }
  ): Promise<void> {
    await this.log.debug(
      "onEvent: {callerPluginName} listening to {pluginName}-{event}",
      { callerPluginName, pluginName, event }
    );
    this.on(`${pluginName}-${event}`, (args: any) => {
      if (this._lastReceivedMessageIds.includes(args.msgID)) {
        return;
      }
      this.lastReceivedMessageIds = args.msgID;
      listener(args.data);
    });
  }

  public async emitEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    args: Array<any>
  ): Promise<void> {
    await this.log.debug(
      "emitEvent: {callerPluginName} emitting {pluginName}-{event}",
      { callerPluginName, pluginName, event }
    );
    this.emit(`${pluginName}-${event}`, {
      msgID: randomUUID(),
      data: args,
    });
  }
}
