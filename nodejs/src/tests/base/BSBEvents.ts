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

import { expect } from "chai";
import { BSBEventsRef } from "../../base/BSBEvents";
import { createTestObservable } from "../trace";
import { BSB_ERROR_METHOD_NOT_IMPLEMENTED, BSBError } from "../../base/errorMessages";
import { MockSBObservable } from "../mocks";
import { Readable } from "node:stream";

describe("BSBEvents", () => {
  const obs = createTestObservable();

  describe("BSBEventsRef", () => {
    let events: BSBEventsRef;

    beforeEach(() => {
      events = new BSBEventsRef({
        appId: "test-app",
        mode: "development",
        cwd: process.cwd(),
        packageCwd: process.cwd(),
        pluginCwd: process.cwd(),
        pluginName: "test-plugin",
        pluginVersion: "0.0.0",
        sbObservable: MockSBObservable(),
        config: null
      });
    });

    it("should throw not implemented for onBroadcast", async () => {
      try {
        await events.onBroadcast(obs, "test-plugin", "test-event", async () => { });
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onBroadcast").toString());
      }
    });

    it("should throw not implemented for emitBroadcast", async () => {
      try {
        await events.emitBroadcast(obs, "test-plugin", "test-event", []);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "emitBroadcast").toString());
      }
    });

    it("should throw not implemented for onEvent", async () => {
      try {
        await events.onEvent(obs, "test-plugin", "test-event", async () => { });
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onEvent").toString());
      }
    });

    it("should throw not implemented for emitEvent", async () => {
      try {
        await events.emitEvent(obs, "test-plugin", "test-event", []);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "emitEvent").toString());
      }
    });

    it("should throw not implemented for onReturnableEvent", async () => {
      try {
        await events.onReturnableEvent(obs, "test-plugin", "test-event", async () => { });
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onReturnableEvent").toString());
      }
    });

    it("should throw not implemented for emitEventAndReturn", async () => {
      try {
        await events.emitEventAndReturn(obs, "test-plugin", "test-event", 30, []);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "emitEventAndReturn").toString());
      }
    });

    it("should throw not implemented for receiveStream", async () => {
      try {
        await events.receiveStream(obs, "test-plugin", "test-event", async () => { }, 30);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "receiveStream").toString());
      }
    });

    it("should throw not implemented for sendStream", async () => {
      try {
        const mockStream = new Readable({
          read() {
            this.push(null);
          }
        });
        await events.sendStream(obs, "test-plugin", "test-event", "test-stream-id", mockStream);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "sendStream").toString());
      }
    });

    it("should do nothing when run is called", () => {
      expect(() => events.run()).to.not.throw();
    });
  });
});
