import { expect } from "chai";
import { BSBEventsRef } from "../../base/BSBEvents";
import { createFakeDTrace } from "../trace";
import { BSB_ERROR_METHOD_NOT_IMPLEMENTED, BSBError } from "../../base/errorMessages";
import { MockSBLogging, MockSBMetrics } from "../mocks";
import { Readable } from "node:stream";

describe("BSBEvents", () => {
  const dummyTrace = createFakeDTrace();

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
        sbLogging: MockSBLogging(),
        sbMetrics: MockSBMetrics(),
        config: null
      });
    });

    it("should throw not implemented for onBroadcast", async () => {
      try {
        await events.onBroadcast(dummyTrace, "test-plugin", "test-event", async () => { });
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onBroadcast").toString());
      }
    });

    it("should throw not implemented for emitBroadcast", async () => {
      try {
        await events.emitBroadcast(dummyTrace, "test-plugin", "test-event", []);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "emitBroadcast").toString());
      }
    });

    it("should throw not implemented for onEvent", async () => {
      try {
        await events.onEvent(dummyTrace, "test-plugin", "test-event", async () => { });
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onEvent").toString());
      }
    });

    it("should throw not implemented for emitEvent", async () => {
      try {
        await events.emitEvent(dummyTrace, "test-plugin", "test-event", []);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "emitEvent").toString());
      }
    });

    it("should throw not implemented for onReturnableEvent", async () => {
      try {
        await events.onReturnableEvent(dummyTrace, "test-plugin", "test-event", async () => { });
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "onReturnableEvent").toString());
      }
    });

    it("should throw not implemented for emitEventAndReturn", async () => {
      try {
        await events.emitEventAndReturn(dummyTrace, "test-plugin", "test-event", 30, []);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as BSBError<string>).toString()).to.equal(BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBEventsRef", "emitEventAndReturn").toString());
      }
    });

    it("should throw not implemented for receiveStream", async () => {
      try {
        await events.receiveStream(dummyTrace, "test-event", async () => { }, 30);
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
        await events.sendStream(dummyTrace, "test-event", "test-stream-id", mockStream);
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
