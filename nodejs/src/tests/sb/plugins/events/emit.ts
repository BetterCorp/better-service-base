import * as assert from "assert";
import {randomUUID} from "crypto";
import {BSBEvents, SmartFunctionCallSync, DTrace} from "../../../../index";

const randomName = () => randomUUID();
const createTrace = (): DTrace => ({ t: randomUUID(), s: randomUUID() });

export function emit(
    genNewPlugin: { (): Promise<BSBEvents> },
    maxTimeoutToExpectAResponse: number,
) {
  let emitter: BSBEvents;
  beforeEach(async () => {
    emitter = await genNewPlugin();
  });
  afterEach(function () {
    SmartFunctionCallSync(emitter, emitter.dispose);
  });
  describe("Emit", async function () {
    this.timeout(maxTimeoutToExpectAResponse + 10);
    this.afterEach((done) => setTimeout(done, maxTimeoutToExpectAResponse));
    describe("emitEvent", async () => {
      const emitData = true;
      it("only one plugin should receive the event", async () => {
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const trace = createTrace();
        let receiveCounter = 0;
        setTimeout(() => {
          if (receiveCounter === 1) {
            return assert.ok(receiveCounter);
          }
          if (receiveCounter === 0) {
            return assert.fail("Event not received");
          }
          assert.fail("Received " + receiveCounter + " events");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(trace, thisPlugin, thisEvent, async (receivedTrace: DTrace, args: any[]) => {
          assert.strictEqual(receivedTrace.t, trace.t);
          receiveCounter++;
        });
        await emitter.onEvent(trace, thisPlugin, thisEvent, async (receivedTrace: DTrace, args: any[]) => {
          assert.strictEqual(receivedTrace.t, trace.t);
          receiveCounter++;
        });
        await emitter.emitEvent(trace, thisPlugin, thisEvent, [emitData]);
      });
      it("diff plugin names should not receive same event", async () => {
        const thisPlugin = randomName();
        const thisPlugin2 = randomName();
        const thisEvent = randomName();
        const trace = createTrace();
        let receiveCounter = 0;
        setTimeout(() => {
          if (receiveCounter === 1) {
            return assert.ok(receiveCounter);
          }
          if (receiveCounter === 0) {
            return assert.fail("Event not received");
          }
          assert.fail("Received " + receiveCounter + " events");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(trace, thisPlugin, thisEvent, async () => {
          assert.fail("Received on diff plugin name");
        });
        await emitter.onEvent(trace, thisPlugin2, thisEvent, async (receivedTrace: DTrace, args: any[]) => {
          assert.strictEqual(receivedTrace.t, trace.t);
          receiveCounter++;
        });
        await emitter.onEvent(trace, thisPlugin2, thisEvent, async (receivedTrace: DTrace, args: any[]) => {
          assert.strictEqual(receivedTrace.t, trace.t);
          receiveCounter++;
        });
        await emitter.emitEvent(trace, thisPlugin2, thisEvent, [emitData]);
      });
      it("should be able to emit to events with plugin name defined", async () => {
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const trace = createTrace();
        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(trace, thisPlugin, thisEvent, async (receivedTrace: DTrace, data: any[]) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(receivedTrace.t, trace.t);
          assert.ok(data[0]);
        });
        await emitter.emitEvent(trace, thisPlugin, thisEvent, [emitData]);
      });
      it("should be able to emit to events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const trace = createTrace();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(trace, thisCaller, thisEvent, async (receivedTrace: DTrace, data: any[]) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(receivedTrace.t, trace.t);
          assert.ok(data[0]);
        });
        await emitter.emitEvent(trace, thisCaller, thisEvent, [emitData]);
      });
      it("should be able to emit to events with self multi-args", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const trace = createTrace();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(trace, thisCaller, thisEvent, async (receivedTrace: DTrace, data: any[]) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(receivedTrace.t, trace.t);
          assert.deepEqual(data[0], 0);
          assert.deepEqual(data[1], 1);
          assert.deepEqual(data[2], 2);
          assert.deepEqual(data[3], 3);
        });
        await emitter.emitEvent(trace, thisCaller, thisEvent, [0, 1, 2, 3]);
      });
      it("should not be able to emit to other events with plugin name defined", async () => {
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const trace = createTrace();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(trace, thisPlugin, thisEvent, async () => {
          clearTimeout(emitTimeout);
          assert.fail("Event received");
        });
        await emitter.emitEvent(trace, thisPlugin, thisEvent2, [emitData]);
      });
      it("should not be able to emit to other events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const trace = createTrace();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(trace, thisCaller, thisEvent, async () => {
          clearTimeout(emitTimeout);
          assert.fail("Event received");
        });
        await emitter.emitEvent(trace, thisCaller, thisEvent2, [emitData]);
      });
    });
    describe("onEvent", async () => {
      const emitData = "ABCD";
      it("should be able to emit to events with plugin name defined", async () => {
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const trace = createTrace();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(trace, thisPlugin, thisEvent, async (receivedTrace: DTrace, data: any[]) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(receivedTrace.t, trace.t);
          assert.deepEqual(data[0], emitData);
        });
        await emitter.emitEvent(trace, thisPlugin, thisEvent, [emitData]);
      });
      it("should be able to emit to events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const trace = createTrace();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(trace, thisCaller, thisEvent, async (receivedTrace: DTrace, data: any[]) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(receivedTrace.t, trace.t);
          assert.deepEqual(data[0], emitData);
        });
        await emitter.emitEvent(trace, thisCaller, thisEvent, [emitData]);
      });
      it("should not be able to emit to other events with plugin name defined", async () => {
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const trace = createTrace();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(trace, thisPlugin, thisEvent, async () => {
          clearTimeout(emitTimeout);
          assert.fail("Event received");
        });
        await emitter.emitEvent(trace, thisPlugin, thisEvent2, [emitData]);
      });
      it("should not be able to emit to other events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const trace = createTrace();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(trace, thisCaller, thisEvent, async () => {
          clearTimeout(emitTimeout);
          assert.fail("Event received");
        });
        await emitter.emitEvent(trace, thisCaller, thisEvent2, [emitData]);
      });
    });
    const typesToTest = [
      {
        name: "Null",
        data: null,
      },
      {
        name: "Boolean true",
        data: true,
      },
      {
        name: "Boolean false",
        data: false,
      },
      {
        name: "String",
        data: "HELLO WO4lD",
      },
      {
        name: "Min Number",
        data: Number.MIN_SAFE_INTEGER,
      },
      {
        name: "Max Number",
        data: Number.MAX_SAFE_INTEGER,
      },
      {
        name: "Array",
        data: [
          0,
          "Hello",
          true,
        ],
      },
      {
        name: "Object",
        data: {
          name: "Sarah",
          surname: "Blond",
          age: 24,
          meta: {
            location: [
              -12212,
              55336,
            ],
          },
        },
      },
    ];
    for (const typeToTest of typesToTest) {
      describe(`emitEvent ${typeToTest.name}`, async () => {
        it("should be able to emit to events with plugin name defined", async () => {
          const thisPlugin = randomName();
          const thisEvent = randomName();
          const trace = createTrace();

          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, maxTimeoutToExpectAResponse);
          await emitter.onEvent(trace, thisPlugin, thisEvent, async (receivedTrace: DTrace, data: any[]) => {
            clearTimeout(emitTimeout);
            assert.strictEqual(receivedTrace.t, trace.t);
            assert.deepEqual(data[0], typeToTest.data);
          });
          await emitter.emitEvent(trace, thisPlugin, thisEvent, [typeToTest.data]);
        });
        it("should be able to emit to events with self", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const trace = createTrace();

          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, maxTimeoutToExpectAResponse);
          await emitter.onEvent(trace, thisCaller, thisEvent, async (receivedTrace: DTrace, data: any[]) => {
            clearTimeout(emitTimeout);
            assert.strictEqual(receivedTrace.t, trace.t);
            assert.deepEqual(data[0], typeToTest.data);
          });
          await emitter.emitEvent(trace, thisCaller, thisEvent, [typeToTest.data]);
        });
        it("should not be able to emit to other events with plugin name defined", async () => {
          const thisPlugin = randomName();
          const thisEvent = randomName();
          const thisEvent2 = randomName();
          const trace = createTrace();

          const emitTimeout = setTimeout(() => {
            assert.ok(true);
          }, maxTimeoutToExpectAResponse);
          await emitter.onEvent(trace, thisPlugin, thisEvent, async () => {
            clearTimeout(emitTimeout);
            assert.fail("Event received");
          });
          await emitter.emitEvent(trace, thisPlugin, thisEvent2, [typeToTest.data]);
        });
        it("should not be able to emit to other events with self", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const thisEvent2 = randomName();
          const trace = createTrace();

          const emitTimeout = setTimeout(() => {
            assert.ok(true);
          }, maxTimeoutToExpectAResponse);
          await emitter.onEvent(trace, thisCaller, thisEvent, async () => {
            clearTimeout(emitTimeout);
            assert.fail("Event received");
          });
          await emitter.emitEvent(trace, thisCaller, thisEvent2, [typeToTest.data]);
        });
      });
    }
  });
}