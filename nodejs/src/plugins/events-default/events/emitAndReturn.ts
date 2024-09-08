import {EventEmitter} from "node:events";
import {IPluginLogger} from "../../../index";

export class emitAndReturn
    extends EventEmitter {
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
      listener: { (traceId: string, args: Array<any>): Promise<any> },
  ): Promise<void> {
    this.log.debug("onReturnableEvent: listening to {pluginName}-{event}", {
      pluginName,
      event,
    });
    this.on(`${pluginName}-${event}`, async (resolve, reject, traceId, data) => {
      try {
        resolve(await listener(traceId, data));
      } catch (exc) {
        reject(exc);
      }
    });
  }

  public async emitEventAndReturn(
      pluginName: string,
      event: string,
      traceId: string,
      timeoutSeconds: number,
      args: Array<any>,
  ): Promise<any> {
    this.log.debug("emitReturnableEvent: emitting {pluginName}-{event} with traceId {traceId}", {
      pluginName, event, traceId: traceId ?? "no-traceId",
    });
    const self = this;
    return new Promise((resolve, reject) => {
      const timeoutHandler = setTimeout(() => {
        reject("Timeout");
      }, timeoutSeconds * 1000);
      self.emit(
          `${pluginName}-${event}`,
          (args: any) => {
            clearTimeout(timeoutHandler);
            resolve(args);
          },
          (args: any) => {
            clearTimeout(timeoutHandler);
            reject(args);
          },
          traceId,
          args,
      );
    });
  }
}
