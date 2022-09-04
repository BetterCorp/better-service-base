import {
  DynamicallyReferencedMethodBase,
  DynamicallyReferencedMethodType,
} from "@bettercorp/tools/lib/Interfaces";
import { Readable } from "stream";

export type DynamicallyReferencedMethodOnIEvents<
  Interface extends DynamicallyReferencedMethodBase,
  Method extends string,
  hasReturnable extends boolean = false
> = Interface[Method] extends (...a: infer Arguments) => infer Return
  ? [
      event: Method,
      listener: {
        (...a: Arguments): hasReturnable extends true ? Return : Promise<void>;
      }
    ]
  : [event: Method, noMatchingEvent: never];

export type DynamicallyReferencedMethodEmitIEvents<
  Interface extends DynamicallyReferencedMethodBase,
  Method extends string
> = Interface[Method] extends (...a: infer Arguments) => infer Return
  ? [event: Method, ...a: Arguments]
  : [noMatchingEvent: never];

export type DynamicallyReferencedMethodEmitEARIEvents<
  Interface extends DynamicallyReferencedMethodBase,
  Method extends string,
  ArgsReference extends boolean = true,
  ShowTimeout extends boolean = true
> = ArgsReference extends true
  ? Interface[Method] extends (...a: infer Arguments) => infer Return
    ? ShowTimeout extends true
      ? [
          event: Method,
          timeoutSeconds?: number,
          ...a: Arguments
        ]
      : [event: Method, ...a: Arguments]
    : [event: Method, noMatchingEvent: never]
  : Interface[Method] extends (...a: infer Arguments) => infer Return
  ? Return extends Promise<unknown>
    ? Return
    : Promise<Return>
  : Promise<never>;

export interface IServiceEvents<
  onEvents,
  emitEvents,
  onReturnableEvents,
  emitReturnableEvents
> {
  onEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<onEvents>,
      TA,
      false
    >
  ): Promise<void>;
  emitEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitIEvents<
      DynamicallyReferencedMethodType<emitEvents>,
      TA
    >
  ): Promise<void>;
  onReturnableEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<
      DynamicallyReferencedMethodType<onReturnableEvents>,
      TA,
      true
    >
  ): Promise<void>;
  emitEventAndReturn<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitEARIEvents<
      DynamicallyReferencedMethodType<emitReturnableEvents>,
      TA,
      true,
      false
    >
  ): DynamicallyReferencedMethodEmitEARIEvents<
    DynamicallyReferencedMethodType<onReturnableEvents>,
    TA,
    false
  >;
  emitEventAndReturnTimed<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitEARIEvents<
      DynamicallyReferencedMethodType<emitReturnableEvents>,
      TA,
      true,
      true
    >
  ): DynamicallyReferencedMethodEmitEARIEvents<
    DynamicallyReferencedMethodType<onReturnableEvents>,
    TA,
    false
  >;
  receiveStream(
    listener: { (error: Error | null, stream: Readable): Promise<void> },
    timeoutSeconds?: number
  ): Promise<string>;
  sendStream(streamId: string, stream: Readable): Promise<void>;
}
