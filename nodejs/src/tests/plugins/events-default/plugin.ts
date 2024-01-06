import assert from "assert";
import { Plugin } from "../../../plugins/events-default/plugin";
import { emit as emitDirect } from "../../../plugins/events-default/events/emit";
import { randomUUID } from "crypto";
import {
  RunEventsPluginTests,
  generateNullLogging,
} from "../../../tests/sb/plugins/events/plugin";

describe("plugins/events-default", () => {
  describe("Events Emit", async () => {
    it("_lastReceivedMessageIds should be empty on init", async () => {
      const emit = new emitDirect(generateNullLogging());
      assert.equal((emit as any)._lastReceivedMessageIds.length, 0);
    });
    it("_lastReceivedMessageIds should contain latest emit ID", async () => {
      const emit = new emitDirect(generateNullLogging());
      await emit.onEvent("b", "c", async () => {});
      await emit.emitEvent("b", "c", []);
      assert.equal((emit as any)._lastReceivedMessageIds.length, 1);
    });
    it("_lastReceivedMessageIds should call only once", async () => {
      const emit = new emitDirect(generateNullLogging());
      const testID = randomUUID();
      let called = 0;
      await emit.onEvent("b", "c", async () => {
        called++;
      });
      emit.emit(`b-c`, {
        msgID: testID,
        data: [],
      });
      assert.equal(called, 1);
    });
    it("_lastReceivedMessageIds should call only once, per id", async () => {
      const emit = new emitDirect(generateNullLogging());
      const testID1 = randomUUID();
      const testID2 = randomUUID();
      let called = 0;
      await emit.onEvent("b", "c", async () => {
        called++;
      });
      emit.emit(`b-c`, {
        msgID: testID1,
        data: [],
      });
      emit.emit(`b-c`, {
        msgID: testID2,
        data: [],
      });
      assert.equal(called, 2);
    });
    it("_lastReceivedMessageIds should cycle ids > 50", async () => {
      const emit = new emitDirect(generateNullLogging());
      const testIDs: Array<string> = "."
        .repeat(100)
        .split("")
        .map(() => randomUUID());
      await emit.onEvent("b", "c", async () => {});
      for (const emitID of testIDs)
        emit.emit(`b-c`, {
          msgID: emitID,
          data: [],
        });
      assert.equal((emit as any)._lastReceivedMessageIds.length, 51);
    });
  });

  RunEventsPluginTests(Plugin);
});
