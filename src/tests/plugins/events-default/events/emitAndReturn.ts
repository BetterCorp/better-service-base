import assert from "assert";
import { randomUUID } from "crypto";
import { Events } from "../../../../plugins/events-default/plugin";

const randomName = () => randomUUID();

export function emitAndReturn(
  genNewPlugin: { (): Promise<Events> },
  maxTimeoutToExpectAResponse: number,
  a = true,
  b = true
) {
  describe("EmitAndReturn", async () => {
    //if (a) this.timeout(maxTimeoutToExpectAResponse + 20);
    //if (b) this.afterEach(done => setTimeout(done, maxTimeoutToExpectAResponse));
    const timermaxTimeoutToExpectAResponse = maxTimeoutToExpectAResponse + 10;
    describe("emitEventAndReturn", async () => {
      const emitData = true;
      const emitData2 = false;
      it("should be able to emit to events with plugin name defined", async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, timermaxTimeoutToExpectAResponse);
        await emitter.onReturnableEvent(
          thisCaller,
          thisPlugin,
          thisEvent,
          async (data: Array<any>) => {
            setTimeout(() => {
              console.log("Received onEvent");
              assert.ok(true, "Received onEvent");
            }, 1);
            return emitData2;
          }
        );
        console.log("!!Received onEvent");
        await emitter.emitEventAndReturn(
          thisCaller,
          thisPlugin,
          thisEvent,
          maxTimeoutToExpectAResponse / 1000,
          []
        );
        console.log("++Received onEvent");
        clearTimeout(emitTimeout);
        assert.ok(true, "Received Response");
        emitter.dispose();
      });
      it("should be able to emit to events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, timermaxTimeoutToExpectAResponse);
        await emitter.onReturnableEvent(
          thisCaller,
          thisCaller,
          thisEvent,
          async (data: Array<any>) => {
            assert.ok(true, "Received onEvent");
            return emitData2;
          }
        );
        await emitter.emitEventAndReturn(
          thisCaller,
          thisCaller,
          thisEvent,
          maxTimeoutToExpectAResponse / 1000,
          [emitData]
        );
        clearTimeout(emitTimeout);
        assert.ok(true, "Received Response");
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
        }, timermaxTimeoutToExpectAResponse);
        await emitter.onReturnableEvent(
          thisCaller,
          thisPlugin,
          thisEvent,
          (data: Array<any>) => {
            assert.fail("EEAR MSG Received");
          }
        );
        try {
          await emitter.emitEventAndReturn(
            thisCaller,
            thisPlugin,
            thisEvent2,
            maxTimeoutToExpectAResponse / 1000,
            [emitData]
          );
          clearTimeout(emitTimeout);
          assert.fail("EEAR Returned");
        } catch (exc) {
          clearTimeout(emitTimeout);
          assert.ok("Timeout of EEAR");
        }
        emitter.dispose();
      });
      it("should not be able to emit to other events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, timermaxTimeoutToExpectAResponse);
        await emitter.onReturnableEvent(
          thisCaller,
          thisCaller,
          thisEvent,
          (data: Array<any>) => {
            assert.fail("EEAR MSG Received");
          }
        );
        try {
          await emitter.emitEventAndReturn(
            thisCaller,
            thisCaller,
            thisEvent2,
            maxTimeoutToExpectAResponse / 1000,
            [emitData]
          );
          clearTimeout(emitTimeout);
          assert.fail("EEAR Returned");
        } catch (exc) {
          clearTimeout(emitTimeout);
          assert.ok("Timeout of EEAR");
        }
        emitter.dispose();
      });
      it("should timeout correctly", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, timermaxTimeoutToExpectAResponse);
        await emitter.onReturnableEvent(
          thisCaller,
          thisCaller,
          thisEvent,
          async (data: Array<any>) => {}
        );
        try {
          await emitter.emitEventAndReturn(
            thisCaller,
            thisCaller,
            thisEvent,
            maxTimeoutToExpectAResponse / 1000,
            [emitData]
          );
          clearTimeout(emitTimeout);
          assert.fail("EEAR Returned");
        } catch (exc) {
          clearTimeout(emitTimeout);
          assert.ok("Timeout of EEAR");
        }
        emitter.dispose();
      });
      it("should response error correctly", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, timermaxTimeoutToExpectAResponse);
        await emitter.onReturnableEvent(
          thisCaller,
          thisCaller,
          thisEvent,
          (data: Array<any>) => {
            throw "THISISANERROR";
          }
        );
        try {
          await emitter.emitEventAndReturn(
            thisCaller,
            thisCaller,
            thisEvent,
            maxTimeoutToExpectAResponse / 1000,
            [emitData]
          );
          clearTimeout(emitTimeout);
          assert.fail("EEAR Returned");
        } catch (exc) {
          clearTimeout(emitTimeout);
          assert.ok("EEAR");
          assert.strictEqual(exc, "THISISANERROR");
        }
        emitter.dispose();
      });
    });
    const typesToTest = [
      {
        name: "DiffData",
        data: null,
        rData: "HELLO WORLD",
      },
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
    for (let typeToTest of typesToTest) {
      describe(`emitEventAndReturn ${typeToTest.name}`, async () => {
        it("should be able to emit to events with plugin name defined", async () => {
          const thisCaller = randomName();
          const thisPlugin = randomName();
          const thisEvent = randomName();
          const emitter = await genNewPlugin();
          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, timermaxTimeoutToExpectAResponse);
          await emitter.onReturnableEvent(
            thisCaller,
            thisPlugin,
            thisEvent,
            async (data: Array<any>) => {
              return typeToTest.rData || typeToTest.data;
            }
          );
          const resp = await emitter.emitEventAndReturn(
            thisCaller,
            thisPlugin,
            thisEvent,
            maxTimeoutToExpectAResponse / 1000,
            [typeToTest.data]
          );
          clearTimeout(emitTimeout);
          assert.strictEqual(
            JSON.stringify(resp),
            JSON.stringify(typeToTest.rData || typeToTest.data)
          );
          emitter.dispose();
        });
        it("should be able to emit to events with self", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const emitter = await genNewPlugin();
          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received - timeout");
          }, timermaxTimeoutToExpectAResponse);
          await emitter.onReturnableEvent(
            thisCaller,
            thisCaller,
            thisEvent,
            async (data: Array<any>) => {
              clearTimeout(emitTimeout);
              assert.strictEqual(
                JSON.stringify(data[0]),
                JSON.stringify(typeToTest.data),
                "Received data"
              );
              return typeToTest.rData || typeToTest.data;
            }
          );
          assert.strictEqual(
            JSON.stringify(
              await emitter.emitEventAndReturn(
                thisCaller,
                thisCaller,
                thisEvent,
                maxTimeoutToExpectAResponse / 1000,
                [typeToTest.data]
              )
            ),
            JSON.stringify(typeToTest.rData || typeToTest.data),
            "Returned data"
          );
          clearTimeout(emitTimeout);
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
          }, timermaxTimeoutToExpectAResponse);
          await emitter.onReturnableEvent(
            thisCaller,
            thisPlugin,
            thisEvent,
            (data: Array<any>) => {
              assert.fail("EEAR MSG Received");
            }
          );
          try {
            await emitter.emitEventAndReturn(
              thisCaller,
              thisPlugin,
              thisEvent2,
              maxTimeoutToExpectAResponse / 1000,
              [typeToTest.data]
            );
            clearTimeout(emitTimeout);
            assert.fail("EEAR Returned");
          } catch (exc) {
            clearTimeout(emitTimeout);
            assert.ok("Timeout of EEAR");
          }
          emitter.dispose();
        });
        it("should not be able to emit to other events with self", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const thisEvent2 = randomName();
          const emitter = await genNewPlugin();
          const emitTimeout = setTimeout(() => {
            assert.ok(true);
          }, timermaxTimeoutToExpectAResponse);
          await emitter.onReturnableEvent(
            thisCaller,
            thisCaller,
            thisEvent,
            (data: Array<any>) => {
              assert.fail("EEAR MSG Received");
            }
          );
          try {
            await emitter.emitEventAndReturn(
              thisCaller,
              thisCaller,
              thisEvent2,
              maxTimeoutToExpectAResponse / 1000,
              [typeToTest.data]
            );
            clearTimeout(emitTimeout);
            assert.fail("EEAR Returned");
          } catch (exc) {
            clearTimeout(emitTimeout);
            assert.ok("Timeout of EEAR");
          }
          emitter.dispose();
        });
        it("should timeout correctly - general timeout", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const emitter = await genNewPlugin();
          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, timermaxTimeoutToExpectAResponse + 10);
          await emitter.onReturnableEvent(
            thisCaller,
            thisCaller,
            thisEvent,
            async (data: Array<any>) => {}
          );
          try {
            await emitter.emitEventAndReturn(
              thisCaller,
              thisCaller,
              thisEvent,
              maxTimeoutToExpectAResponse / 1000,
              [typeToTest.data]
            );
            clearTimeout(emitTimeout);
            assert.fail("EEAR Returned");
          } catch (exc) {
            clearTimeout(emitTimeout);
            assert.ok("Timeout of EEAR");
          }
          emitter.dispose();
        });
        it("should timeout correctly - no receipt", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const emitter = await genNewPlugin();
          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, timermaxTimeoutToExpectAResponse + 10);
          try {
            await emitter.emitEventAndReturn(
              thisCaller,
              thisCaller,
              thisEvent,
              maxTimeoutToExpectAResponse / 1000,
              [typeToTest.data]
            );
            clearTimeout(emitTimeout);
            assert.fail("EEAR Returned");
          } catch (exc) {
            clearTimeout(emitTimeout);
            assert.ok("Timeout of EEAR");
          }
          emitter.dispose();
        });
        it("should response error correctly", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const emitter = await genNewPlugin();
          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, timermaxTimeoutToExpectAResponse);
          await emitter.onReturnableEvent(
            thisCaller,
            thisCaller,
            thisEvent,
            (data: Array<any>) => {
              throw typeToTest.rData || typeToTest.data;
            }
          );
          try {
            await emitter.emitEventAndReturn(
              thisCaller,
              thisCaller,
              thisEvent,
              maxTimeoutToExpectAResponse / 1000,
              [typeToTest.data]
            );
            clearTimeout(emitTimeout);
            assert.fail("EEAR Returned");
          } catch (exc) {
            clearTimeout(emitTimeout);
            assert.ok("EEAR");
            assert.strictEqual(
              JSON.stringify(exc),
              JSON.stringify(typeToTest.rData || typeToTest.data)
            );
          }
          emitter.dispose();
        });
      });
    }
  });
}
