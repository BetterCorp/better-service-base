import {DynamicallyReferencedMethodBase} from "./tools";

export type DynamicallyReferencedMethodCallable<
    Interface extends DynamicallyReferencedMethodBase,
    Method extends keyof Interface,
    ArgsReference extends boolean = true
    //ShowTimeout extends boolean = true
> = ArgsReference extends true
    ? // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Interface[Method] extends (...a: infer Arguments) => infer Return
    ? [event: Method, ...a: Arguments]
    : [event: Method, noMatchingEvent: never]
    : Interface[Method] extends (...a: infer Arguments) => infer Return
      ? Return
      : Promise<never>;

export type DynamicallyReferencedMethodOnIEvents<
    Interface extends DynamicallyReferencedMethodBase,
    Method extends keyof Interface,
    hasReturnable extends boolean = false
> = Interface[Method] extends (...a: infer Arguments) => infer Return
    ? [
      event: Method,
      listener: {
        (traceId: string, ...a: Arguments): hasReturnable extends true
                           ? Return
                           : void | Promise<void>;
      }
    ]
    : [event: Method, noMatchingEvent: never];

export type DynamicallyReferencedMethodEmitIEvents<
    Interface extends DynamicallyReferencedMethodBase,
    Method extends keyof Interface
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
> = Interface[Method] extends (...a: infer Arguments) => infer Return
    ? [event: Method, traceId: string, ...a: Arguments]
    : [event: Method, noMatchingEvent: never];

export type DynamicallyReferencedMethodEmitEARIEvents<
    Interface extends DynamicallyReferencedMethodBase,
    Method extends keyof Interface,
    ArgsReference extends boolean = true
    //ShowTimeout extends boolean = true
> = ArgsReference extends true
    ? // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Interface[Method] extends (...a: infer Arguments) => infer Return
    ? //? ShowTimeout extends true
    [event: Method, traceId: string, timeoutSeconds?: number, ...a: Arguments]
    : //: [event: Method, ...a: Arguments]
    [event: Method, noMatchingEvent: never]
    : Interface[Method] extends (...a: infer Arguments) => infer Return
      ? Return extends Promise<unknown>
        ? Return
        : Promise<Return>
      : Promise<never>;

/**
 * @hidden
 */
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
/**
 * @hidden
 */
export type EventsEventBaseTypes =
    (typeof EventsEventTypesBase)[keyof typeof EventsEventTypesBase];
/**
 * @hidden
 */
export type EventsEventTypes =
    | "onEventSpecific"
    | "emitEventSpecific"
    | "onReturnableEventSpecific"
    | "emitEventAndReturnSpecific"
    | "emitEventAndReturnTimedSpecific"
    | EventsEventBaseTypes;
