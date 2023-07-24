import assert from "assert";
//import { Logger } from "./test-logger";
import { Events as events } from "../../../plugins/events-default/plugin";
import * as emitDirect from "../../../plugins/events-default/events/emit";
import { broadcast } from "./events/broadcast";
import { emit } from "./events/emit";
import { emitAndReturn } from "./events/emitAndReturn";
import { emitStreamAndReceiveStream } from "./events/emitStreamAndReceiveStream";
import { IPluginLogger, LogMeta } from "../../../interfaces/logger";
import { randomUUID } from "crypto";

//const fakeCLogger = new Logger("test-plugin", process.cwd(), {} as any);
//const debug = console.log;
//const debug = console.log;
const debug = (...a: any) => {};
const fakeLogger: IPluginLogger = {
  reportStat: async (key, value): Promise<void> => {},
  reportTextStat: async (message, meta, hasPIData): Promise<void> => {
    debug(message, meta);
  },
  info: async (message, meta, hasPIData): Promise<void> => {
    debug(message, meta);
  },
  warn: async (message, meta, hasPIData): Promise<void> => {
    debug(message, meta);
  },
  error: async (
    messageOrError: string | Error,
    meta?: LogMeta<any>,
    hasPIData?: boolean
  ): Promise<void> => {
    debug(messageOrError, meta);
    assert.fail(
      typeof messageOrError === "string"
        ? new Error(messageOrError)
        : messageOrError
    );
  },
  fatal: async (
    messageOrError: string | Error,
    meta?: LogMeta<any>,
    hasPIData?: boolean
  ): Promise<void> => {
    debug(messageOrError, meta);
    assert.fail(
      typeof messageOrError === "string"
        ? new Error(messageOrError)
        : messageOrError
    );
  },
  debug: async (message, meta, hasPIData): Promise<void> => {
    debug(message, meta);
  },
};

const getPluginConfig = async () => {
  return {};
};

describe("plugins/events-default", () => {
  describe("Events Emit", async () => {
    it("_lastReceivedMessageIds should be empty on init", async () => {
      let emit = new emitDirect.default(fakeLogger);
      assert.equal((emit as any)._lastReceivedMessageIds.length, 0);
    });
    it("_lastReceivedMessageIds should contain latest emit ID", async () => {
      let emit = new emitDirect.default(fakeLogger);
      await emit.onEvent("a", "b", "c", async () => {});
      await emit.emitEvent("a", "b", "c", []);
      assert.equal((emit as any)._lastReceivedMessageIds.length, 1);
    });
    it("_lastReceivedMessageIds should call only once", async () => {
      let emit = new emitDirect.default(fakeLogger);
      let testID = randomUUID();
      let called = 0;
      await emit.onEvent("a", "b", "c", async () => {
        called++;
      });
      emit.emit(`b-c`, {
        msgID: testID,
        data: [],
      });
      assert.equal(called, 1);
    });
    it("_lastReceivedMessageIds should call only once, per id", async () => {
      let emit = new emitDirect.default(fakeLogger);
      let testID1 = randomUUID();
      let testID2 = randomUUID();
      let called = 0;
      await emit.onEvent("a", "b", "c", async () => {
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
      let emit = new emitDirect.default(fakeLogger);
      let testIDs: Array<string> = "."
        .repeat(100)
        .split("")
        .map(() => randomUUID());
      await emit.onEvent("a", "b", "c", async () => {});
      for (let emitID of testIDs)
        emit.emit(`b-c`, {
          msgID: emitID,
          data: [],
        });
      assert.equal((emit as any)._lastReceivedMessageIds.length, 51);
    });
  });
  broadcast(async () => {
    const refP = new events(
      "test-plugin",
      process.cwd(),
      process.cwd(),
      fakeLogger
    );
    (refP as any).getPluginConfig = getPluginConfig;
    if (refP.init !== undefined) await refP.init();
    return refP;
  }, 10);
  emit(async () => {
    const refP = new events(
      "test-plugin",
      process.cwd(),
      process.cwd(),
      fakeLogger
    );
    (refP as any).getPluginConfig = getPluginConfig;
    if (refP.init !== undefined) await refP.init();
    return refP;
  }, 10);
  emitAndReturn(async () => {
    const refP = new events(
      "test-plugin",
      process.cwd(),
      process.cwd(),
      fakeLogger
    );
    (refP as any).getPluginConfig = getPluginConfig;
    if (refP.init !== undefined) await refP.init();
    return refP;
  }, 10);
  emitStreamAndReceiveStream(async () => {
    const refP = new events(
      "test-plugin",
      process.cwd(),
      process.cwd(),
      fakeLogger
    );
    (refP as any).getPluginConfig = getPluginConfig;
    if (refP.init !== undefined) await refP.init();
    //refP.eas.staticCommsTimeout = 25;
    return refP;
  }, 50);
});
