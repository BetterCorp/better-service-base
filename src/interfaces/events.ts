import {
  DynamicallyReferencedMethodBase,
  IDictionary,
} from "@bettercorp/tools/lib/Interfaces";
import { Readable } from "stream";

export type DynamicallyReferencedMethodOnIEvents<
  Interface extends IDictionary<Function>,
  Method extends string
> = Interface[Method] extends (...a: infer Arguments) => infer Return // If this DRM was called via the arguments of the method, then we return the args array
  ? // If the method actually exists, we return the original argument (method) plus all additional arguments
    [
      callerPluginName: string,
      pluginName: string,
      event: Method,
      listener: { (...a: Arguments): Promise<void> }
    ]
  : // No method is known, so we just define the default argument (method) and an argument that will never be valid to cause typescript to error
    [
      callerPluginName: string,
      pluginName: string,
      event: Method,
      noMatchingEvent: never
    ];

export type DynamicallyReferencedMethodOnEARIEvents<
  Interface extends IDictionary<Function>,
  Method extends string
> = Interface[Method] extends (...a: infer Arguments) => infer Return // If this DRM was called via the arguments of the method, then we return the args array
  ? // If the method actually exists, we return the original argument (method) plus all additional arguments
    [
      callerPluginName: string,
      pluginName: string,
      event: Method,
      listener: { (...a: Arguments): Promise<Return> }
    ]
  : // No method is known, so we just define the default argument (method) and an argument that will never be valid to cause typescript to error
    [
      callerPluginName: string,
      pluginName: string,
      event: Method,
      noMatchingEvent: never
    ];

export type DynamicallyReferencedMethodEmitIEvents<
  Interface extends IDictionary<Function>,
  Method extends string
> = Interface[Method] extends (...a: infer Arguments) => infer Return // If this DRM was called via the arguments of the method, then we return the args array
  ? // If the method actually exists, we return the original argument (method) plus all additional arguments
    [
      callerPluginName: string,
      pluginName: string,
      event: Method,
      ...a: Arguments
    ]
  : // No method is known, so we just define the default argument (method) and an argument that will never be valid to cause typescript to error
    [
      callerPluginName: string,
      pluginName: string,
      event: Method,
      noMatchingEvent: never
    ];

export type DynamicallyReferencedMethodEmitEARIEvents<
  Interface extends IDictionary<Function>,
  Method extends string,
  ArgsReference extends boolean = true
> = ArgsReference extends true
  ? // If this DRM was called via the arguments of the method, then we return the args array
    Interface[Method] extends (...a: infer Arguments) => infer Return
    ? // If the method actually exists, we return the original argument (method) plus all additional arguments
      [
        callerPluginName: string,
        pluginName: string,
        event: Method,
        timeoutSeconds: number,
        ...a: Arguments
      ]
    : // No method is known, so we just define the default argument (method) and an argument that will never be valid to cause typescript to error
      [
        callerPluginName: string,
        pluginName: string,
        event: Method,
        timeoutSeconds: number,
        noMatchingEvent: never
      ]
  : // For the return properties we do the same method check
  Interface[Method] extends (...a: infer Arguments) => infer Return
  ? // If the method exists, we return the methods return information
      Return 
  : // Else we return a never as it doesn't exist
    Promise<never>;

export interface IEvents<
  onEvents extends DynamicallyReferencedMethodBase,
  emitEvents extends DynamicallyReferencedMethodBase,
  onReturnableEvents extends DynamicallyReferencedMethodBase,
  emitReturnableEvents extends DynamicallyReferencedMethodBase
> {
  init?(): Promise<void>;
  onEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnIEvents<onEvents, TA>
  ): Promise<void>;
  onReturnableEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodOnEARIEvents<onReturnableEvents, TA>
  ): Promise<void>;
  emitEvent<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitIEvents<emitEvents, TA>
  ): Promise<void>;
  emitEventAndReturn<TA extends string>(
    ...args: DynamicallyReferencedMethodEmitEARIEvents<emitReturnableEvents, TA>
  ): DynamicallyReferencedMethodEmitEARIEvents<emitReturnableEvents, TA, false>;
  receiveStream(
    callerPluginName: string,
    listener: { (error: Error | null, stream: Readable): Promise<void> },
    timeoutSeconds?: number
  ): Promise<string>;
  sendStream(
    callerPluginName: string,
    streamId: string,
    stream: Readable
  ): Promise<void>;
}

export interface IPluginEvents<
  onEvents extends DynamicallyReferencedMethodBase,
  emitEvents extends DynamicallyReferencedMethodBase,
  onReturnableEvents extends DynamicallyReferencedMethodBase,
  emitReturnableEvents extends DynamicallyReferencedMethodBase
> {
  onEvent<TA extends string>(
    event: onEvents,
    listener: { (data: ArgsDataType): Promise<void> }
  ): Promise<void>;
  onReturnableEvent<TA extends string>(
    event: onReturnableEvents,
    listener: { (data?: ArgsDataType): Promise<ReturnDataType> }
  ): Promise<void>;
  emitEvent<TA extends string>(
    event: emitEvents,
    data?: ArgsDataType
  ): Promise<void>;
  emitEventAndReturn<TA extends string>(
    event: emitReturnableEvents,
    data?: ArgsDataType,
    timeoutSeconds?: number
  ): Promise<ReturnDataType>;
  receiveStream(
    listener: { (error: Error | null, stream: Readable): Promise<void> },
    timeoutSeconds?: number
  ): Promise<string>;
  sendStream(streamId: string, stream: Readable): Promise<void>;
}
