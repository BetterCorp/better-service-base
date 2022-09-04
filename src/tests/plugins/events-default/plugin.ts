import assert from "assert";
//import { Logger } from "./test-logger";
import { Events as events } from "../../../plugins/events-default/plugin";
import { emit } from "./events/emit";
import { emitAndReturn } from "./events/emitAndReturn";
import { emitStreamAndReceiveStream } from "./events/emitStreamAndReceiveStream";
import { IPluginLogger } from "../../../interfaces/logger";

//const fakeCLogger = new Logger("test-plugin", process.cwd(), {} as any);
//const debug = console.log;
const debug = (...a: any)=>{};
const fakeLogger: IPluginLogger = {
  reportStat: async (key, value): Promise<void> => {},
  info: async (message, meta, hasPIData): Promise<void> => {
    debug(message, meta);
  },
  warn: async (message, meta, hasPIData): Promise<void> => {
    debug(message, meta);
  },
  error: async (message, meta, hasPIData): Promise<void> => {
    debug(message, meta);
    assert.fail(new Error(message));
  },
  fatal: async (message, meta, hasPIData): Promise<void> => {
    debug(message, meta);
    assert.fail(new Error(message));
  },
  debug: async (message, meta, hasPIData): Promise<void> => {
    debug(message, meta);
  },
};

describe("plugins/events-default", () => {
  emit(async () => {
    const refP = new events("test-plugin", process.cwd(), fakeLogger);
    if (refP.init !== undefined) await refP.init();
    return refP;
  }, 10);
  emitAndReturn(async () => {
    const refP = new events("test-plugin", process.cwd(), fakeLogger);
    if (refP.init !== undefined) await refP.init();
    return refP;
  }, 10);
  emitStreamAndReceiveStream(async () => {
    const refP = new events("test-plugin", process.cwd(), fakeLogger);
    if (refP.init !== undefined) await refP.init();
    //refP.eas.staticCommsTimeout = 25;
    return refP;
  }, 50);
});
