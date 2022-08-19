import { DynamicallyReferencedMethodBase } from '@bettercorp/tools/lib/Interfaces';
import { EventEmitter } from "events";
import { IPluginLogger } from '../interfaces/logger';
import { DynamicallyReferencedMethodEmitIEvents, DynamicallyReferencedMethodOnIEvents } from '../interfaces/events';

export default class emit<
onEvents extends DynamicallyReferencedMethodBase,
emitEvents extends DynamicallyReferencedMethodBase> extends EventEmitter {
  private log: IPluginLogger;

  constructor(log: IPluginLogger) {
    super();
    this.log = log;
  }

  public async onEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<onEvents, TA>
  ): Promise<void> {
    let callerPluginName = args[0];
    let pluginName = args[1];
    let event = args[2];
    await this.log.debug(
      "onEvent: {callerPluginName} listening to {pluginName}-{event}",
      { callerPluginName, pluginName, event }
    );
    this.on(`${pluginName}-${event}`, args[3]);
  }

  public async emitEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitIEvents<emitEvents, TA>
  ): Promise<void> {
    let callerPluginName = args[0];
    let pluginName = args[1];
    let event = args[2];
    args.splice(0,3);
    await this.log.debug(
      "emitEvent: {callerPluginName} emitting {pluginName}-{event}",
      { callerPluginName, pluginName, event }
    );
    this.emit(`${pluginName}-${event}`, args);
  }
}
