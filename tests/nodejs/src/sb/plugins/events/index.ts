/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd  
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

import { broadcast } from "./broadcast";
import { emit } from "./emit";
import { emitAndReturn } from "./emitAndReturn";
import { emitStreamAndReceiveStream } from "./emitStreamAndReceiveStream";
import { BSBEventsRef } from "@bsb/base";
import { getEventsConstructorConfig } from "../../../mocks";
import { createTestObservable } from "../../../trace";

export const RunEventsPluginTests = (
  eventsPlugin: typeof BSBEventsRef,
  config: any = undefined,
) => {
  const obs = createTestObservable();
  broadcast(async () => {
    const refP = new eventsPlugin(await getEventsConstructorConfig(config));
    if (refP.init !== undefined) {
      await refP.init(obs);
    }
    return refP;
  }, 100);
  emit(async () => {
    const refP = new eventsPlugin(await getEventsConstructorConfig(config));
    if (refP.init !== undefined) {
      await refP.init(obs);
    }
    return refP;
  }, 100);
  emitAndReturn(async () => {
    const refP = new eventsPlugin(await getEventsConstructorConfig(config));
    if (refP.init !== undefined) {
      await refP.init(obs);
    }
    return refP;
  }, 100);
  emitStreamAndReceiveStream(async () => {
    const refP = new eventsPlugin(await getEventsConstructorConfig(config));
    if (refP.init !== undefined) {
      await refP.init(obs);
    }
    //refP.eas.staticCommsTimeout = 25;
    return refP;
  }, 50);
};
