import assert from "assert";
import { EventsBase } from "../../../src/events/events";
import { ErrorMessages } from "../../../src/interfaces/static";

describe("EventsBase", function () {
  describe("Constructor", async function () {
    it("Should construct correctly [pluginName]", async () => {
      let myobj = new EventsBase("pluginNameX", "cwd", "pluginCwd", {} as any);
      assert.strictEqual(myobj.pluginName, "pluginNameX");
    });
    it("Should construct correctly [cwd]", async () => {
      let myobj = new EventsBase("pluginNameX", "cwdD", "pluginCwd", {} as any);
      assert.strictEqual((myobj as any).cwd, "cwdD");
    });
    it("Should construct correctly [pluginCwd]", async () => {
      let myobj = new EventsBase(
        "pluginNameX",
        "cwdD",
        "pluginCwdY",
        {} as any
      );
      assert.strictEqual((myobj as any).pluginCwd, "pluginCwdY");
    });
    it("Should construct correctly [logger]", async () => {
      let myobj = new EventsBase("pluginNameX", "cwdD", "pluginCwdY", {
        alog: true,
      } as any);
      assert.strictEqual((myobj as any).log.alog, true);
    });
  });
  describe("Default methods", function () {
    it("onBroadcast should throw", async () => {
      try {
        let myobj = new EventsBase("a", "b", "c", {} as any);
        await myobj.onBroadcast("a", "b", "c", async () => {});
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
      }
    });
    it("emitBroadcast should throw", async () => {
      try {
        let myobj = new EventsBase("a", "b", "c", {} as any);
        await myobj.emitBroadcast("a", "b", "c", []);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
      }
    });
    it("onEvent should throw", async () => {
      try {
        let myobj = new EventsBase("a", "b", "c", {} as any);
        await myobj.onEvent("a", "b", "c", async () => {});
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
      }
    });
    it("emitEvent should throw", async () => {
      try {
        let myobj = new EventsBase("a", "b", "c", {} as any);
        await myobj.emitEvent("a", "b", "c", []);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
      }
    });
    it("onReturnableEvent should throw", async () => {
      try {
        let myobj = new EventsBase("a", "b", "c", {} as any);
        await myobj.onReturnableEvent("a", "b", "c", async () => {});
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
      }
    });
    it("emitEventAndReturn should throw", async () => {
      try {
        let myobj = new EventsBase("a", "b", "c", {} as any);
        await myobj.emitEventAndReturn("a", "b", "c", 1, []);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
      }
    });
    it("receiveStream should throw", async () => {
      try {
        let myobj = new EventsBase("a", "b", "c", {} as any);
        await myobj.receiveStream("a", async () => {});
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
      }
    });
    it("sendStream should throw", async () => {
      try {
        let myobj = new EventsBase("a", "b", "c", {} as any);
        await myobj.sendStream("a", "", {} as any);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.EventsNotImplementedProperly);
      }
    });
  });
});
