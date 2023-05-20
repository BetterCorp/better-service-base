import { EventsBase } from '../../../../events/events';
import assert from "assert";
import { randomUUID } from "crypto";

const randomName = () => randomUUID();

export function emit(
  genNewPlugin: { (): Promise<EventsBase> },
  maxTimeoutToExpectAResponse: number
) {
  let emitter: EventsBase;
  beforeEach(async () => {
    emitter = await genNewPlugin();
  });
  afterEach(function () {
    emitter.dispose();
  });
  describe("Emit", async function () {
    this.timeout(maxTimeoutToExpectAResponse + 10);
    this.afterEach((done) => setTimeout(done, maxTimeoutToExpectAResponse));
    describe("emitEvent", async () => {
      const emitData = true;
      it("only one plugin should receive the event", async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        //console.log(emitter)
        let emitTimeout: NodeJS.Timeout | null = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(
          thisCaller,
          thisPlugin,
          thisEvent,
          async (data: any) => {
            if (emitTimeout === null) {
              assert.fail("Event received twice");
              return;
            }
            clearTimeout(emitTimeout);
            emitTimeout = null;
            assert.ok(data[0]);
          }
        );
        await emitter.onEvent(
          thisCaller,
          thisPlugin,
          thisEvent,
          async (data: any) => {
            if (emitTimeout === null) {
              assert.fail("Event received twice");
              return;
            }
            clearTimeout(emitTimeout);
            emitTimeout = null;
            assert.ok(data[0]);
          }
        );
        await emitter.emitEvent(thisCaller, thisPlugin, thisEvent, [emitData]);
      });
      it("should be able to emit to events with plugin name defined", async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
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
            assert.ok(data[0]);
          }
        );
        await emitter.emitEvent(thisCaller, thisPlugin, thisEvent, [emitData]);
      });
      it("should be able to emit to events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();

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
      });
      it("should be able to emit to events with self multi-args", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();

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
      });
      it("should not be able to emit to other events with plugin name defined", async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(
          thisCaller,
          thisPlugin,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);

            assert.fail("Event received");
          }
        );
        await emitter.emitEvent(thisCaller, thisPlugin, thisEvent2, [emitData]);
      });
      it("should not be able to emit to other events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(
          thisCaller,
          thisCaller,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);

            assert.fail("Event received");
          }
        );
        await emitter.emitEvent(thisCaller, thisCaller, thisEvent2, [emitData]);
      });
    });
    describe("onEvent", async () => {
      const emitData = "ABCD";
      it("should be able to emit to events with plugin name defined", async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();

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
      });
      it("should be able to emit to events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();

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
      });
      it("should not be able to emit to other events with plugin name defined", async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(
          thisCaller,
          thisPlugin,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);

            assert.fail("Event received");
          }
        );
        await emitter.emitEvent(thisCaller, thisPlugin, thisEvent2, [emitData]);
      });
      it("should not be able to emit to other events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(
          thisCaller,
          thisCaller,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);

            assert.fail("Event received");
          }
        );
        await emitter.emitEvent(thisCaller, thisCaller, thisEvent2, [emitData]);
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
        });
        it("should be able to emit to events with self", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();

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
        });
        it("should not be able to emit to other events with plugin name defined", async () => {
          const thisCaller = randomName();
          const thisPlugin = randomName();
          const thisEvent = randomName();
          const thisEvent2 = randomName();

          const emitTimeout = setTimeout(() => {
            assert.ok(true);
          }, maxTimeoutToExpectAResponse);
          await emitter.onEvent(
            thisCaller,
            thisPlugin,
            thisEvent,
            async (data: any) => {
              clearTimeout(emitTimeout);

              assert.fail("Event received");
            }
          );
          await emitter.emitEvent(thisCaller, thisPlugin, thisEvent2, [
            typeToTest.data,
          ]);
        });
        it("should not be able to emit to other events with self", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const thisEvent2 = randomName();

          const emitTimeout = setTimeout(() => {
            assert.ok(true);
          }, maxTimeoutToExpectAResponse);
          await emitter.onEvent(
            thisCaller,
            thisCaller,
            thisEvent,
            async (data: any) => {
              clearTimeout(emitTimeout);

              assert.fail("Event received");
            }
          );
          await emitter.emitEvent(thisCaller, thisCaller, thisEvent2, [
            typeToTest.data,
          ]);
        });
      });
  });
}
