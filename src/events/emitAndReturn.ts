import { DynamicallyReferencedMethodBase } from '@bettercorp/tools/lib/Interfaces';
import { EventEmitter } from "events";
import { DynamicallyReferencedMethodEmitEARIEvents, DynamicallyReferencedMethodOnEARIEvents } from '../interfaces/events';
import { IPluginLogger } from "../interfaces/logger";

interface testttt extends DynamicallyReferencedMethodBase {

}

export default class emitAndReturn<
  onReturnableEvents extends DynamicallyReferencedMethodBase,
  emitReturnableEvents extends DynamicallyReferencedMethodBase
> extends EventEmitter {
  private log: IPluginLogger;

  constructor(log: IPluginLogger) {
    super();
    this.log = log;
  }

  public async onReturnableEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnEARIEvents<onReturnableEvents, TA>
  ): Promise<void> {
    let callerPluginName = args[0];
    let pluginName = args[1];
    let event = args[2];
    this.log.debug(
      "onReturnableEvent: {callerPluginName} listening to {pluginName}-{event}",
      { callerPluginName, pluginName, event }
    );
    this.on(event, async (resolve, reject, data) => {
      try {
        return resolve(await args[3](data));
      } catch (exc) {
        reject(exc);
      }
    });

    this.emitEventAndReturn2("","", "")
  }

  public async emitEventAndReturn2<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitEARIEvents<testttt, TA>
  ): Promise<testttt[TA] extends (...a: infer Arguments) => infer Return ? Return : Promise<never>> {
  }
  public async emitEventAndReturn<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitEARIEvents<emitReturnableEvents, TA>
  ): Promise<emitReturnableEvents[TA] extends (...a: infer Arguments) => infer Return ? Return : Promise<never>> {
    this.log.debug(
      "emitReturnableEvent: {callerPluginName} emitting {pluginName}-{event}",
      { callerPluginName, pluginName: pluginName || "_self", event }
    );
    return new Promise((resolve, reject) => {
      let timeoutHandler = setTimeout(() => {
        reject("Timeout");
      }, timeout * 1000);
      this.emit(
        event,
        (args: ReturnDataType) => {
          clearTimeout(timeoutHandler);
          resolve(args);
        },
        (args: ReturnDataType) => {
          clearTimeout(timeoutHandler);
          reject(args);
        },
        data
      );
    });
  }
}
