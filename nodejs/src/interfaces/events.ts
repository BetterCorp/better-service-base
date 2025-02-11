/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2024 BetterCorp (PTY) Ltd  
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program. 
 * The commercial license allows you to use the Program in a closed-source manner, 
 * including the right to create derivative works that are not subject to the terms 
 * of the AGPL. 
 *
 * To obtain a commercial license, please contact the copyright holders at 
 * https://www.bettercorp.dev. The terms and conditions of the commercial license 
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { DTrace } from './metrics';
import {DynamicallyReferencedMethodBase} from "./tools";

export type DynamicallyReferencedMethodOnIEvents<
    Interface extends DynamicallyReferencedMethodBase,
    Method extends keyof Interface,
    hasReturnable extends boolean = false
> = Interface[Method] extends (...a: infer Arguments) => infer Return
    ? [
      event: Method,
      trace: DTrace, 
      listener: {
        (trace: DTrace, ...a: Arguments): hasReturnable extends true
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
    ? [event: Method, trace: DTrace, ...a: Arguments]
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
    [event: Method, trace: DTrace, timeoutSeconds?: number, ...a: Arguments]
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
