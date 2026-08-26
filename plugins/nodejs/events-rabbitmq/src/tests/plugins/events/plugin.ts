import { Plugin } from "../../../plugins/events-rabbitmq/index.js";
import { BSBEventsRef } from "@bsb/base";
import { broadcast } from "./events/broadcast.js";
import { emit } from "./events/emit.js";
import { emitAndReturn } from "./events/emitAndReturn.js";
import { emitStreamAndReceiveStream } from "./events/emitStreamAndReceiveStream.js";
import { getEventsConstructorConfig } from "../../mocks.js";
import { createTestObservable } from "../../trace.js";
import { LIB } from "../../../plugins/events-rabbitmq/events/lib.js";
import { broadcast as RabbitBroadcast } from "../../../plugins/events-rabbitmq/events/broadcast.js";
import * as assert from "assert";


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

describe("plugins/events-rabbitmq poison handling", () => {
  it("requeues failed deliveries nine times then dead-letters", () => {
    const attempts = new Map<string, number>();
    const nacks: Array<{ allUpTo: boolean; requeue: boolean }> = [];
    const channel = {
      nack: (_msg: unknown, allUpTo: boolean, requeue: boolean) => {
        nacks.push({ allUpTo, requeue });
      },
    };
    const obs = createTestObservable();
    const msg = {
      fields: { routingKey: "route" },
      properties: { messageId: "persistent-id" },
    };

    for (let i = 0; i < LIB.MAX_DELIVERY_ATTEMPTS; i++) {
      LIB.nackOrDeadLetter(obs, channel as any, msg as any, attempts, "persistent-id", new Error("bad"), "test");
    }

    assert.strictEqual(nacks.length, LIB.MAX_DELIVERY_ATTEMPTS);
    assert.deepStrictEqual(nacks.slice(0, -1).map((nack) => nack.requeue), Array(9).fill(true));
    assert.strictEqual(nacks[nacks.length - 1]?.requeue, false);
    assert.strictEqual(attempts.has("persistent-id"), false);
  });
});

describe("plugins/events-rabbitmq broadcast routing", () => {
  it("uses exact routing so one broadcast event does not reach another event queue", () => {
    const backend = new RabbitBroadcast({} as any);
    assert.deepStrictEqual((backend as any).exchange, {
      type: "direct",
      name: "better.service9.broadcast.direct",
    });
  });
});
