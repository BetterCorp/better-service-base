import assert from "assert";
import { randomUUID } from "crypto";
import { Events } from "../../plugins/events-default/plugin";

const randomName = () => randomUUID();

export function emit(
  genNewPlugin: { (): Promise<Events> },
  maxTimeoutToExpectAResponse: number
) {
  describe("Emit", async function () {
    this.timeout(maxTimeoutToExpectAResponse + 10);
    this.afterEach((done) => setTimeout(done, maxTimeoutToExpectAResponse));
    describe("emitEvent", async () => {
      const emitData = true;
      it("should be able to emit to events with plugin name defined", async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        //console.log(emitter)
        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(
          thisCaller,
          thisPlugin,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);
            assert.ok(data);
          }
        );
        await emitter.emitEvent(thisCaller, thisPlugin, thisEvent, [emitData]);
        emitter.dispose();
      });
      it("should be able to emit to events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(
          thisCaller,
          thisCaller,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);
            assert.ok(data);
          }
        );
        await emitter.emitEvent(thisCaller, thisCaller, thisEvent, [emitData]);
        emitter.dispose();
      });
      it("should be able to emit to events with self multi-args", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(
          thisCaller,
          thisCaller,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);
            assert.equal(data, [0, 1, 2, 3]);
          }
        );
        await emitter.emitEvent(
          thisCaller,
          thisCaller,
          thisEvent,
          [0, 1, 2, 3]
        );
        emitter.dispose();
      });
      it("should not be able to emit to other events with plugin name defined", async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(
          thisCaller,
          thisPlugin,
          thisEvent,
          (data: any) => {
            clearTimeout(emitTimeout);
            assert.fail("Event received");
          }
        );
        await emitter.emitEvent(thisCaller, thisPlugin, thisEvent2, [emitData]);
        emitter.dispose();
      });
      it("should not be able to emit to other events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(
          thisCaller,
          thisCaller,
          thisEvent,
          (data: any) => {
            clearTimeout(emitTimeout);
            assert.fail("Event received");
          }
        );
        await emitter.emitEvent(thisCaller, thisCaller, thisEvent2, [emitData]);
        emitter.dispose();
      });
    });
    describe("onEvent", async () => {
      const emitData = "ABCD";
      it("should be able to emit to events with plugin name defined", async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(
          thisCaller,
          thisPlugin,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);
            assert.strictEqual(data, emitData);
          }
        );
        await emitter.emitEvent(thisCaller, thisPlugin, thisEvent, [emitData]);
        emitter.dispose();
      });
      it("should be able to emit to events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(
          thisCaller,
          thisCaller,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);
            assert.strictEqual(data, emitData);
          }
        );
        await emitter.emitEvent(thisCaller, thisCaller, thisEvent, [emitData]);
        emitter.dispose();
      });
      it("should not be able to emit to other events with plugin name defined", async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(
          thisCaller,
          thisPlugin,
          thisEvent,
          (data: any) => {
            clearTimeout(emitTimeout);
            assert.fail("Event received");
          }
        );
        await emitter.emitEvent(thisCaller, thisPlugin, thisEvent2, [emitData]);
        emitter.dispose();
      });
      it("should not be able to emit to other events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(
          thisCaller,
          thisCaller,
          thisEvent,
          (data: any) => {
            clearTimeout(emitTimeout);
            assert.fail("Event received");
          }
        );
        await emitter.emitEvent(thisCaller, thisCaller, thisEvent2, [emitData]);
        emitter.dispose();
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
        data: [0, "Hello", true],
      },
      {
        name: "Object",
        data: {
          name: "Sarah",
          surname: "Blond",
          age: 24,
          meta: {
            location: [-12212, 55336],
          },
        },
      },
    ];
    for (let typeToTest of typesToTest)
      describe(`emit ${typeToTest.name}`, async () => {
        it("should be able to emit to events with plugin name defined", async () => {
          const thisCaller = randomName();
          const thisPlugin = randomName();
          const thisEvent = randomName();
          const emitter = await genNewPlugin();
          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, maxTimeoutToExpectAResponse);
          await emitter.onEvent(
            thisCaller,
            thisPlugin,
            thisEvent,
            async (data: any) => {
              clearTimeout(emitTimeout);
              assert.strictEqual(data, typeToTest.data);
            }
          );
          await emitter.emitEvent(thisCaller, thisPlugin, thisEvent, [
            typeToTest.data,
          ]);
          emitter.dispose();
        });
        it("should be able to emit to events with self", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const emitter = await genNewPlugin();
          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, maxTimeoutToExpectAResponse);
          await emitter.onEvent(
            thisCaller,
            thisCaller,
            thisEvent,
            async (data: any) => {
              clearTimeout(emitTimeout);
              assert.strictEqual(data, typeToTest.data);
            }
          );
          await emitter.emitEvent(thisCaller, thisCaller, thisEvent, [
            typeToTest.data,
          ]);
          emitter.dispose();
        });
        it("should not be able to emit to other events with plugin name defined", async () => {
          const thisCaller = randomName();
          const thisPlugin = randomName();
          const thisEvent = randomName();
          const thisEvent2 = randomName();
          const emitter = await genNewPlugin();
          const emitTimeout = setTimeout(() => {
            assert.ok(true);
          }, maxTimeoutToExpectAResponse);
          await emitter.onEvent(
            thisCaller,
            thisPlugin,
            thisEvent,
            (data: any) => {
              clearTimeout(emitTimeout);
              assert.fail("Event received");
            }
          );
          await emitter.emitEvent(thisCaller, thisPlugin, thisEvent2, [
            typeToTest.data,
          ]);
          emitter.dispose();
        });
        it("should not be able to emit to other events with self", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const thisEvent2 = randomName();
          const emitter = await genNewPlugin();
          const emitTimeout = setTimeout(() => {
            assert.ok(true);
          }, maxTimeoutToExpectAResponse);
          await emitter.onEvent(
            thisCaller,
            thisCaller,
            thisEvent,
            (data: any) => {
              clearTimeout(emitTimeout);
              assert.fail("Event received");
            }
          );
          await emitter.emitEvent(thisCaller, thisCaller, thisEvent2, [
            typeToTest.data,
          ]);
          emitter.dispose();
        });
      });
  });
}
