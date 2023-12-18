import { DynamicallyReferencedMethodBase } from "@bettercorp/tools/lib/Interfaces";

export type DynamicallyReferencedMethodCallable<
  Interface extends DynamicallyReferencedMethodBase,
  Method extends string,
  ArgsReference extends boolean = true
  //ShowTimeout extends boolean = true
> = ArgsReference extends true
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  ? Interface[Method] extends (...a: infer Arguments) => infer Return
    ? [event: Method, ...a: Arguments]
    : [event: Method, noMatchingEvent: never]
  : Interface[Method] extends (...a: infer Arguments) => infer Return
  ? Return extends Promise<unknown>
    ? Return
    : Promise<Return>
  : Promise<never>;

export type DynamicallyReferencedMethodOnIEvents<
  Interface extends DynamicallyReferencedMethodBase,
  Method extends string,
  hasReturnable extends boolean = false
> = Interface[Method] extends (...a: infer Arguments) => infer Return
  ? [
      event: Method,
      listener: {
        (...a: Arguments): hasReturnable extends true
          ? Return
          : void | Promise<void>;
      }
    ]
  : [event: Method, noMatchingEvent: never];

export type DynamicallyReferencedMethodEmitIEvents<
  Interface extends DynamicallyReferencedMethodBase,
  Method extends string
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
> = Interface[Method] extends (...a: infer Arguments) => infer Return
  ? [event: Method, ...a: Arguments]
  : [noMatchingEvent: never];

export type DynamicallyReferencedMethodEmitEARIEvents<
  Interface extends DynamicallyReferencedMethodBase,
  Method extends string,
  ArgsReference extends boolean = true
  //ShowTimeout extends boolean = true
> = ArgsReference extends true
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  ? Interface[Method] extends (...a: infer Arguments) => infer Return
    ? //? ShowTimeout extends true
      [event: Method, timeoutSeconds?: number, ...a: Arguments]
    : //: [event: Method, ...a: Arguments]
      [event: Method, noMatchingEvent: never]
  : Interface[Method] extends (...a: infer Arguments) => infer Return
  ? Return extends Promise<unknown>
    ? Return
    : Promise<Return>
  : Promise<never>;

export const EventsEventTypesBase = {
  onBroadcast: "onBroadcast",
  emitBroadcast: "emitBroadcast",
  onEvent: "onEvent",
  emitEvent: "emitEvent",
  onReturnableEvent: "onReturnableEvent",
  emitEventAndReturn: "emitEventAndReturn",
  emitEventAndReturnTimed: "emitEventAndReturnTimed",
  receiveStream: "receiveStream",
  sendStream: "sendStream",
} as const;
export type EventsEventBaseTypes =
  (typeof EventsEventTypesBase)[keyof typeof EventsEventTypesBase];
export type EventsEventTypes =
  | "onEventSpecific"
  | "emitEventSpecific"
  | "onReturnableEventSpecific"
  | "emitEventAndReturnSpecific"
  | "emitEventAndReturnTimedSpecific"
  | EventsEventBaseTypes;
