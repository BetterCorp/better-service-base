import {EventEmitter} from "node:events";
import {IPluginLogger} from "../../../index";
import {randomUUID} from "node:crypto";

export class emit
    extends EventEmitter {
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
      pluginName: string,
      event: string,
      listener: { (traceId: string, args: Array<any>): Promise<void> },
  ): Promise<void> {
    this.log.debug("onEvent: listening to {pluginName}-{event}", {
      pluginName,
      event,
    });
    this.on(`${pluginName}-${event}`, (traceId: string, args: any) => {
      if (this._lastReceivedMessageIds.includes(args.msgID)) {
        return;
      }
      this.lastReceivedMessageIds = args.msgID;
      listener(traceId, args.data);
    });
  }

  public async emitEvent(
      pluginName: string,
      event: string,
      traceId: string,
      args: Array<any>,
  ): Promise<void> {
    this.log.debug("emitEvent: emitting {pluginName}-{event} with traceId {traceId}", {
      pluginName, event, traceId: traceId ?? "no-traceId",
    });
    this.emit(`${pluginName}-${event}`, traceId, {
      msgID: randomUUID(),
      data: args,
    });
  }
}
