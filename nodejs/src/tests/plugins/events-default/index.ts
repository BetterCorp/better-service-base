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

import * as assert from "assert";
import { Plugin } from "../../../plugins/events-default/index";
import { emit as emitDirect } from "../../../plugins/events-default/events/emit";
import { randomUUID } from "crypto";
import {
  RunEventsPluginTests,
} from "../../sb/plugins/events/index";
import { createTestObservable } from "../../trace";
import { generateNullLogging, newMetrics } from '../../mocks';

describe("plugins/events-default", () => {
  describe("Events Emit", async () => {
    const dummyObs = createTestObservable();

    it("_lastReceivedMessageIds should be empty on init", async () => {
      const emit = new emitDirect(generateNullLogging(), await newMetrics());
      assert.equal((emit as any)._lastReceivedMessageIds.length, 0);
    });

    it("_lastReceivedMessageIds should contain latest emit ID", async () => {
      const emit = new emitDirect(generateNullLogging(), await newMetrics());
      await emit.onEvent(dummyObs, "b", "c", async () => {});
      await emit.emitEvent(dummyObs, "b", "c", []);
      assert.equal((emit as any)._lastReceivedMessageIds.length, 1);
    });

    it("_lastReceivedMessageIds should call only once", async () => {
      const emit = new emitDirect(generateNullLogging(), await newMetrics());
      const testID = randomUUID();
      let called = 0;
      await emit.onEvent(dummyObs, "b", "c", async () => {
        called++;
      });
      emit.emit(`b-c`, dummyObs, {
        msgID: testID,
        data: [],
      });
      assert.equal(called, 1);
    });

    it("_lastReceivedMessageIds should call only once, per id", async () => {
      const emit = new emitDirect(generateNullLogging(), await newMetrics());
      const testID1 = randomUUID();
      const testID2 = randomUUID();
      let called = 0;
      await emit.onEvent(dummyObs, "b", "c", async () => {
        called++;
      });
      emit.emit(`b-c`, dummyObs, {
        msgID: testID1,
        data: [],
      });
      emit.emit(`b-c`, dummyObs, {
        msgID: testID2,
        data: [],
      });
      assert.equal(called, 2);
    });

    it("_lastReceivedMessageIds should cycle ids > 50", async () => {
      const emit = new emitDirect(generateNullLogging(), await newMetrics());
      const testIDs: Array<string> = "."
        .repeat(100)
        .split("")
        .map(() => randomUUID());
      await emit.onEvent(dummyObs, "b", "c", async () => {});
      for (const emitID of testIDs)
        emit.emit(`b-c`, dummyObs, {
          msgID: emitID,
          data: [],
        });
      assert.equal((emit as any)._lastReceivedMessageIds.length, 51);
    });
  });

  RunEventsPluginTests(Plugin);
});