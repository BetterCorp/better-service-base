import { EventEmitter } from "events";
import { IPluginLogger } from "../../../";

export class emitAndReturn extends EventEmitter {
  private log: IPluginLogger;

  constructor(log: IPluginLogger) {
    super();
    this.log = log;
  }
  public dispose() {
    this.removeAllListeners();
  }

  public async onReturnableEvent(
    pluginName: string,
    event: string,
    listener: { (args: Array<any>): Promise<any> }
  ): Promise<void> {
    this.log.debug("onReturnableEvent: listening to {pluginName}-{event}", {
      pluginName,
      event,
    });
    this.on(event, async (resolve, reject, data) => {
      try {
        resolve(await listener(data));
      } catch (exc) {
        reject(exc);
      }
    });
  }

  public async emitEventAndReturn(
    pluginName: string,
    event: string,
    timeoutSeconds: number,
    args: Array<any>
  ): Promise<any> {
    this.log.debug("emitReturnableEvent: emitting {pluginName}-{event}", {
      pluginName,
      event,
    });
    const self = this;
    return new Promise((resolve, reject) => {
      const timeoutHandler = setTimeout(() => {
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
