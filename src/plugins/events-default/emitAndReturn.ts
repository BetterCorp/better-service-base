import { EventEmitter } from "events";
import { IPluginLogger } from "../../interfaces/logger";

export default class emitAndReturn extends EventEmitter {
  private log: IPluginLogger;

  constructor(log: IPluginLogger) {
    super();
    this.log = log;
  }

  public async onReturnableEvent(
    callerPluginName: string,
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<any> }
  ): Promise<void> {
    this.log.debug(
      "onReturnableEvent: {callerPluginName} listening to {pluginName}-{event}",
      { callerPluginName, pluginName, event }
    );
    this.on(event, async (resolve, reject, data) => {
      listener(data).then(resolve).catch(reject);
    });
  }

  public async emitEventAndReturn(
    callerPluginName: string,
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    args: Array<any>
  ): Promise<any> {
    this.log.debug(
      "emitReturnableEvent: {callerPluginName} emitting {pluginName}-{event}",
      { callerPluginName, pluginName, event }
    );
    const self = this;
    return new Promise((resolve, reject) => {
      let timeoutHandler = setTimeout(() => {
        reject("Timeout");
      }, timeoutSeconds * 1000);
      self.emit(
        event,
        (args: any) => {
          clearTimeout(timeoutHandler);
          resolve(args);
        },
        (args: any) => {
          clearTimeout(timeoutHandler);
          reject(args);
        },
        args
      );
    });
  }
}
