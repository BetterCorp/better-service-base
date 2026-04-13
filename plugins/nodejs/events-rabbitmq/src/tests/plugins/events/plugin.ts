import { Plugin } from "../../../plugins/events-rabbitmq/index.js";
import { BSBEventsRef } from "@bsb/base";
import { broadcast } from "./events/broadcast.js";
import { emit } from "./events/emit.js";
import { emitAndReturn } from "./events/emitAndReturn.js";
import { emitStreamAndReceiveStream } from "./events/emitStreamAndReceiveStream.js";
import { getEventsConstructorConfig } from "../../mocks.js";
import { createTestObservable } from "../../trace.js";


export const RunEventsPluginTests = (
  eventsPlugin: typeof BSBEventsRef,
  config: any = undefined,
) => {
  broadcast(async () => {
    const refP = new eventsPlugin(getEventsConstructorConfig(config));
    if (refP.init !== undefined) {
      await refP.init(createTestObservable());
    }
    return refP;
  }, 30);
  emit(async () => {
    const refP = new eventsPlugin(getEventsConstructorConfig(config));
    if (refP.init !== undefined) {
      await refP.init(createTestObservable());
    }
    return refP;
  }, 30);
  emitAndReturn(async () => {
    const refP = new eventsPlugin(getEventsConstructorConfig(config));
    if (refP.init !== undefined) {
      await refP.init(createTestObservable());
    }
    return refP;
  }, 30);
  emitStreamAndReceiveStream(async () => {
    const refP = new eventsPlugin(getEventsConstructorConfig(config));
    if (refP.init !== undefined) {
      await refP.init(createTestObservable());
    }
    //refP.eas.staticCommsTimeout = 25;
    return refP;
  }, 500);
};


describe("plugins/events-rabbitmq", () =>
  RunEventsPluginTests(Plugin, {
    platformKey: null,
    fatalOnDisconnect: false,
    prefetch: 10,
    endpoints: ["amqp://127.0.0.1:5670"],
    credentials: {
      username: "guest",
      password: "guest",
    },
  }),
);
