import { EventsBase } from "../../../../events/events";
import assert from "assert";
import { randomUUID } from "crypto";

const randomName = () => randomUUID();

export function broadcast(
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
  describe("EmitBroadcast", async function () {
    this.timeout(maxTimeoutToExpectAResponse + 10);
    this.afterEach((done) => setTimeout(done, maxTimeoutToExpectAResponse));
    describe("emitBroadcast", async () => {
      const emitData = true;
      it("all plugins should receive the event", async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        //console.log(emitter)
        let receiveCounter = 0;
        setTimeout(() => {
          if (receiveCounter === 2) return  assert.ok(receiveCounter);
          if (receiveCounter === 0) return assert.fail("Event not received");
          assert.fail("Received " + receiveCounter + " events");
        }, maxTimeoutToExpectAResponse);
        await emitter.onBroadcast(
          thisCaller,
          thisPlugin,
          thisEvent,
          async (data: any) => {
            receiveCounter++;
          }
        );
        await emitter.onBroadcast(
          thisCaller,
          thisPlugin,
          thisEvent,
          async (data: any) => {
            receiveCounter++;
          }
        );
        await emitter.emitBroadcast(thisCaller, thisPlugin, thisEvent, [emitData]);
      });
      it("should be able to emit to events with plugin name defined", async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        //console.log(emitter)
        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onBroadcast(
          thisCaller,
          thisPlugin,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);
            assert.ok(data[0]);
          }
        );
        await emitter.emitBroadcast(thisCaller, thisPlugin, thisEvent, [
          emitData,
        ]);
      });
      it("should be able to emit to events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onBroadcast(
          thisCaller,
          thisCaller,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);

            assert.ok(data[0]);
          }
        );
        await emitter.emitBroadcast(thisCaller, thisCaller, thisEvent, [
          emitData,
        ]);
      });
      it("should be able to emit to events with self multi-args", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onBroadcast(
          thisCaller,
          thisCaller,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);

            assert.deepEqual(data[0], 0);
            assert.deepEqual(data[1], 1);
            assert.deepEqual(data[2], 2);
            assert.deepEqual(data[3], 3);
          }
        );
        await emitter.emitBroadcast(
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
        await emitter.onBroadcast(
          thisCaller,
          thisPlugin,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);

            assert.fail("Event received");
          }
        );
        await emitter.emitBroadcast(thisCaller, thisPlugin, thisEvent2, [
          emitData,
        ]);
      });
      it("should not be able to emit to other events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onBroadcast(
          thisCaller,
          thisCaller,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);

            assert.fail("Event received");
          }
        );
        await emitter.emitBroadcast(thisCaller, thisCaller, thisEvent2, [
          emitData,
        ]);
      });
    });
    describe("onBroadcast", async () => {
      const emitData = "ABCD";
      it("should be able to emit to events with plugin name defined", async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onBroadcast(
          thisCaller,
          thisPlugin,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);

            assert.deepEqual(data[0], emitData);
          }
        );
        await emitter.emitBroadcast(thisCaller, thisPlugin, thisEvent, [
          emitData,
        ]);
      });
      it("should be able to emit to events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onBroadcast(
          thisCaller,
          thisCaller,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);

            assert.deepEqual(data[0], emitData);
          }
        );
        await emitter.emitBroadcast(thisCaller, thisCaller, thisEvent, [
          emitData,
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
        await emitter.onBroadcast(
          thisCaller,
          thisPlugin,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);

            assert.fail("Event received");
          }
        );
        await emitter.emitBroadcast(thisCaller, thisPlugin, thisEvent2, [
          emitData,
        ]);
      });
      it("should not be able to emit to other events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onBroadcast(
          thisCaller,
          thisCaller,
          thisEvent,
          async (data: any) => {
            clearTimeout(emitTimeout);

            assert.fail("Event received");
          }
        );
        await emitter.emitBroadcast(thisCaller, thisCaller, thisEvent2, [
          emitData,
        ]);
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
      describe(`emitBroadcast ${typeToTest.name}`, async () => {
        it("should be able to emit to events with plugin name defined", async () => {
          const thisCaller = randomName();
          const thisPlugin = randomName();
          const thisEvent = randomName();

          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, maxTimeoutToExpectAResponse);
          await emitter.onBroadcast(
            thisCaller,
            thisPlugin,
            thisEvent,
            async (data: any) => {
              clearTimeout(emitTimeout);

              assert.deepEqual(data[0], typeToTest.data);
            }
          );
          await emitter.emitBroadcast(thisCaller, thisPlugin, thisEvent, [
            typeToTest.data,
          ]);
        });
        it("should be able to emit to events with self", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();

          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, maxTimeoutToExpectAResponse);
          await emitter.onBroadcast(
            thisCaller,
            thisCaller,
            thisEvent,
            async (data: any) => {
              clearTimeout(emitTimeout);

              assert.deepEqual(data[0], typeToTest.data);
            }
          );
          await emitter.emitBroadcast(thisCaller, thisCaller, thisEvent, [
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
          await emitter.onBroadcast(
            thisCaller,
            thisPlugin,
            thisEvent,
            async (data: any) => {
              clearTimeout(emitTimeout);

              assert.fail("Event received");
            }
          );
          await emitter.emitBroadcast(thisCaller, thisPlugin, thisEvent2, [
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
          await emitter.onBroadcast(
            thisCaller,
            thisCaller,
            thisEvent,
            async (data: any) => {
              clearTimeout(emitTimeout);

              assert.fail("Event received");
            }
          );
          await emitter.emitBroadcast(thisCaller, thisCaller, thisEvent2, [
            typeToTest.data,
          ]);
        });
      });
  });
}
