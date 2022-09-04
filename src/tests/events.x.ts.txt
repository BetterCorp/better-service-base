import { DynamicallyReferencedMethodType } from '@bettercorp/tools/lib/Interfaces';
import { DynamicPluginsList } from '../src/interfaces/DynamicPluginsList';
import { IPluginEvents, DynamicallyReferencedMethodOnIEvents, DynamicallyReferencedMethodEmitIEvents, DynamicallyReferencedMethodEmitEARIEvents } from '../src/interfaces/events';

interface testEmit {
  sendEvent(a: boolean): Promise<void>;
}
interface testEmit2 {
  onSend(a: boolean): Promise<void>;
}
interface testEmit3 {
  onEar(a: boolean): Promise<boolean>;
}
interface testEmi23 {
  eEar(a: boolean): Promise<boolean>;
}

class aaa {
  events: IPluginEvents<testEmit2, testEmit, testEmit3, testEmi23> = {
    onEvent: async <TA extends string>(
      ...args: DynamicallyReferencedMethodOnIEvents<
        DynamicallyReferencedMethodType<testEmit2>,
        TA,
        false
      >
    ) => {},
    onReturnableEvent: async <TA extends string>(
      ...args: DynamicallyReferencedMethodOnIEvents<
        DynamicallyReferencedMethodType<testEmit3>,
        TA,
        true
      >
    ) => {},
    emitEvent: async <TA extends string>(
      ...args: DynamicallyReferencedMethodEmitIEvents<
        DynamicallyReferencedMethodType<testEmit>,
        TA
      >
    ) => {},
    emitEventAndReturn: <TA extends string>(
      ...args: DynamicallyReferencedMethodEmitEARIEvents<
        DynamicallyReferencedMethodType<testEmi23>,
        TA,
        true,
        false
      >
    ) => {
      return 1 as any;
    },
    emitEventAndReturnTimed: <TA extends string>(
      ...args: DynamicallyReferencedMethodEmitEARIEvents<
        DynamicallyReferencedMethodType<testEmi23>,
        TA,
        true,
        true
      >
    ) => {
      return 1 as any;
    },
    receiveStream: async (
      listener: { (error: Error | null, stream: any): Promise<void> },
      timeoutSeconds?: number
    ): Promise<string> => {
      return "";
    },
    sendStream: async (streamId: string, stream: any): Promise<void> => {},
  };

  public async testt() {
    this.events.emitEvent(DynamicPluginsList.bsbDemoPlugin, "sendEvent", false);
    this.events.onEvent(
      DynamicPluginsList.bsbDemoPlugin,
      "onSend",
      async (a: boolean): Promise<void> => {
        return;
      }
    );
    this.events.onReturnableEvent(
      DynamicPluginsList.bsbDemoPlugin,
      "onEar",
      async (a: boolean): Promise<boolean> => {
        return true;
      }
    );
    await this.events.emitEventAndReturn(
      DynamicPluginsList.bsbDemoPlugin,
      "eEar",
      true
    );
  }
}
