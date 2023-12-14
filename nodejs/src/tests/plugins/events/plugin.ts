import assert from "assert";
//import { Logger } from "./test-logger";
import { Plugin as events } from "../../../plugins/events-default/plugin";
import * as emitDirect from "../../../plugins/events-default/events/emit";
import { broadcast } from "./events/broadcast";
import { emit } from "./events/emit";
import { emitAndReturn } from "./events/emitAndReturn";
import { emitStreamAndReceiveStream } from "./events/emitStreamAndReceiveStream";
import { randomUUID } from "crypto";
import { BSBEventsConstructor, PluginLogger } from "../../../base";
import { SBLogging } from "../../../serviceBase";

const newSBLogging = () => {
  const sbLogging = new SBLogging(
    "test-app",
    "development",
    process.cwd(),
    {} as any
  );
  sbLogging.logBus.removeAllListeners();
  return sbLogging;
};
const generateNullLogging = () => {
  const sbLogging = newSBLogging();
  return new PluginLogger("development", "test-plugin", sbLogging);
};
const getEventsConstructorConfig = (): BSBEventsConstructor => {
  return {
    appId: "test-app",
    pluginCwd: process.cwd(),
    cwd: process.cwd(),
    mode: "development",
    pluginName: "test-plugin",
    sbLogging: newSBLogging(),
    config: {},
  };
};

describe("plugins/events-default", () => {
  describe("Events Emit", async () => {
    it("_lastReceivedMessageIds should be empty on init", async () => {
      let emit = new emitDirect.default(generateNullLogging());
      assert.equal((emit as any)._lastReceivedMessageIds.length, 0);
    });
    it("_lastReceivedMessageIds should contain latest emit ID", async () => {
      let emit = new emitDirect.default(generateNullLogging());
      await emit.onEvent("b", "c", async () => {});
      await emit.emitEvent("b", "c", []);
      assert.equal((emit as any)._lastReceivedMessageIds.length, 1);
    });
    it("_lastReceivedMessageIds should call only once", async () => {
      let emit = new emitDirect.default(generateNullLogging());
      let testID = randomUUID();
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
      let emit = new emitDirect.default(generateNullLogging());
      let testID1 = randomUUID();
      let testID2 = randomUUID();
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
      let emit = new emitDirect.default(generateNullLogging());
      let testIDs: Array<string> = "."
        .repeat(100)
        .split("")
        .map(() => randomUUID());
      await emit.onEvent("b", "c", async () => {});
      for (let emitID of testIDs)
        emit.emit(`b-c`, {
          msgID: emitID,
          data: [],
        });
      assert.equal((emit as any)._lastReceivedMessageIds.length, 51);
    });
  });
  broadcast(async () => {
    const refP = new events(getEventsConstructorConfig());
    if (refP.init !== undefined) await refP.init();
    return refP;
  }, 10);
  emit(async () => {
    const refP = new events(getEventsConstructorConfig());
    if (refP.init !== undefined) await refP.init();
    return refP;
  }, 10);
  emitAndReturn(async () => {
    const refP = new events(getEventsConstructorConfig());
    if (refP.init !== undefined) await refP.init();
    return refP;
  }, 10);
  emitStreamAndReceiveStream(async () => {
    const refP = new events(getEventsConstructorConfig());
    if (refP.init !== undefined) await refP.init();
    //refP.eas.staticCommsTimeout = 25;
    return refP;
  }, 50);
});
