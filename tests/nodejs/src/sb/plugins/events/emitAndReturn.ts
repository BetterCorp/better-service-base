/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd  
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program. 
 * The commercial license allows you to use the Program in a closed-source manner, 
 * including the right to create derivative works that are not subject to the terms 
 * of the AGPL. 
 *
 * To obtain a commercial license, please contact the copyright holders at 
 * https://www.bettercorp.dev. The terms and conditions of the commercial license 
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { BSBEvents, SmartFunctionCallSync, Observable } from "@bsb/base";
import * as assert from "assert";
import { randomUUID } from "crypto";
import { createTestObservable } from "../../../trace";

const randomName = () => randomUUID();

export function emitAndReturn(
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
  describe("EmitAndReturn", async () => {
    const timermaxTimeoutToExpectAResponse = maxTimeoutToExpectAResponse + 10;
    describe("emitEventAndReturn", async () => {
      const emitData = true;
      const emitData2 = false;
      it("should not respond to different listen events when same event name used with diff plugins", async () => {
        const thisPlugin = randomName();
        const thisPlugin2 = randomName();
        const thisEvent = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, timermaxTimeoutToExpectAResponse);
        await emitter.onReturnableEvent(obs, thisPlugin, thisEvent, async () => {
          assert.fail("Received onEvent with diff plugin name");
        });
        await emitter.onReturnableEvent(obs, thisPlugin2, thisEvent, async (receivedObs: Observable) => {
          assert.strictEqual(receivedObs.traceId, obs.traceId);
          setTimeout(() => {
            //console.log("Received onEvent");
            assert.ok(true, "Received onEvent");
          }, 1);
          return emitData2;
        });
        await emitter.emitEventAndReturn(
          obs,
          thisPlugin2,
          thisEvent,
          maxTimeoutToExpectAResponse / 1000,
          [],
        );
        clearTimeout(emitTimeout);
        assert.ok(true, "Received Response");
      });
      it("should be able to emit to events with plugin name defined", async () => {
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, timermaxTimeoutToExpectAResponse);
        await emitter.onReturnableEvent(obs, thisPlugin, thisEvent, async (receivedObs: Observable) => {
          assert.strictEqual(receivedObs.traceId, obs.traceId);
          setTimeout(() => {
            //console.log("Received onEvent");
            assert.ok(true, "Received onEvent");
          }, 1);
          return emitData2;
        });
        await emitter.emitEventAndReturn(
          obs,
          thisPlugin,
          thisEvent,
          maxTimeoutToExpectAResponse / 1000,
          [],
        );
        clearTimeout(emitTimeout);
        assert.ok(true, "Received Response");
      });
      it("should be able to emit to events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, timermaxTimeoutToExpectAResponse);
        await emitter.onReturnableEvent(obs, thisCaller, thisEvent, async (receivedObs: Observable) => {
          assert.strictEqual(receivedObs.traceId, obs.traceId);
          assert.ok(true, "Received onEvent");
          return emitData2;
        });
        await emitter.emitEventAndReturn(
          obs,
          thisCaller,
          thisEvent,
          maxTimeoutToExpectAResponse / 1000,
          [emitData],
        );
        clearTimeout(emitTimeout);
        assert.ok(true, "Received Response");
      });
      it("should not be able to emit to other events with plugin name defined", async () => {
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, timermaxTimeoutToExpectAResponse);
        await emitter.onReturnableEvent(obs, thisPlugin, thisEvent, () => {
          assert.fail("EEAR MSG Received");
        });
        try {
          await emitter.emitEventAndReturn(
            obs,
            thisPlugin,
            thisEvent2,
            maxTimeoutToExpectAResponse / 1000,
            [emitData],
          );
          clearTimeout(emitTimeout);
          assert.fail("EEAR Returned");
        }
        catch (exc) {
          clearTimeout(emitTimeout);
          assert.ok("Timeout of EEAR");
        }
      });
      it("should not be able to emit to other events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, timermaxTimeoutToExpectAResponse);
        await emitter.onReturnableEvent(obs, thisCaller, thisEvent, () => {
          assert.fail("EEAR MSG Received");
        });
        try {
          await emitter.emitEventAndReturn(
            obs,
            thisCaller,
            thisEvent2,
            maxTimeoutToExpectAResponse / 1000,
            [emitData],
          );
          clearTimeout(emitTimeout);
          assert.fail("EEAR Returned");
        }
        catch (exc) {
          clearTimeout(emitTimeout);
          assert.ok("Timeout of EEAR");
        }
      });
      it("should timeout correctly", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, timermaxTimeoutToExpectAResponse);
        await emitter.onReturnableEvent(obs, thisCaller, thisEvent, async () => {
        });
        try {
          await emitter.emitEventAndReturn(
            obs,
            thisCaller,
            thisEvent,
            maxTimeoutToExpectAResponse / 1000,
            [emitData],
          );
          clearTimeout(emitTimeout);
          assert.fail("EEAR Returned");
        }
        catch (exc) {
          clearTimeout(emitTimeout);
          assert.ok("Timeout of EEAR");
        }
      });
      it("should response error correctly", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, timermaxTimeoutToExpectAResponse);
        await emitter.onReturnableEvent(obs, thisCaller, thisEvent, () => {
          throw "THISISANERROR";
        });
        try {
          await emitter.emitEventAndReturn(
            obs,
            thisCaller,
            thisEvent,
            maxTimeoutToExpectAResponse / 1000,
            [emitData],
          );
          clearTimeout(emitTimeout);
          assert.fail("EEAR Returned");
        }
        catch (exc) {
          clearTimeout(emitTimeout);
          assert.ok("EEAR");
          assert.strictEqual(exc, "THISISANERROR");
        }
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
      describe(`emitEventAndReturn ${ typeToTest.name }`, async () => {
        it("should be able to emit to events with plugin name defined", async () => {
          const thisPlugin = randomName();
          const thisEvent = randomName();
          const obs = createTestObservable();

          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, timermaxTimeoutToExpectAResponse);
          await emitter.onReturnableEvent(obs, thisPlugin, thisEvent, async (receivedObs: Observable) => {
            assert.strictEqual(receivedObs.traceId, obs.traceId);
            return typeToTest.rData !== undefined
              ? typeToTest.rData
              : typeToTest.data;
          });
          const resp = await emitter.emitEventAndReturn(
            obs,
            thisPlugin,
            thisEvent,
            maxTimeoutToExpectAResponse / 1000,
            [typeToTest.data],
          );
          clearTimeout(emitTimeout);
          assert.strictEqual(
            JSON.stringify(resp),
            JSON.stringify(
              typeToTest.rData !== undefined
                ? typeToTest.rData
                : typeToTest.data,
            ),
          );
        });
        it("should be able to emit to events with self", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const obs = createTestObservable();

          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received - timeout");
          }, timermaxTimeoutToExpectAResponse);
          await emitter.onReturnableEvent(
            obs,
            thisCaller,
            thisEvent,
            async (receivedObs: Observable, data: Array<any>) => {
              assert.strictEqual(receivedObs.traceId, obs.traceId);
              clearTimeout(emitTimeout);
              assert.strictEqual(
                JSON.stringify(data[0]),
                JSON.stringify(typeToTest.data),
                "Received data",
              );
              return typeToTest.rData || typeToTest.data;
            },
          );
          assert.strictEqual(
            JSON.stringify(
              await emitter.emitEventAndReturn(
                obs,
                thisCaller,
                thisEvent,
                maxTimeoutToExpectAResponse / 1000,
                [typeToTest.data],
              ),
            ),
            JSON.stringify(typeToTest.rData || typeToTest.data),
            "Returned data",
          );
          clearTimeout(emitTimeout);
        });
        it("should not be able to emit to other events with plugin name defined", async () => {
          const thisPlugin = randomName();
          const thisEvent = randomName();
          const thisEvent2 = randomName();
          const obs = createTestObservable();

          const emitTimeout = setTimeout(() => {
            assert.ok(true);
          }, timermaxTimeoutToExpectAResponse);
          await emitter.onReturnableEvent(obs, thisPlugin, thisEvent, () => {
            assert.fail("EEAR MSG Received");
          });
          try {
            await emitter.emitEventAndReturn(
              obs,
              thisPlugin,
              thisEvent2,
              maxTimeoutToExpectAResponse / 1000,
              [typeToTest.data],
            );
            clearTimeout(emitTimeout);
            assert.fail("EEAR Returned");
          }
          catch (exc) {
            clearTimeout(emitTimeout);
            assert.ok("Timeout of EEAR");
          }
        });
        it("should not be able to emit to other events with self", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const thisEvent2 = randomName();
          const obs = createTestObservable();

          const emitTimeout = setTimeout(() => {
            assert.ok(true);
          }, timermaxTimeoutToExpectAResponse);
          await emitter.onReturnableEvent(obs, thisCaller, thisEvent, () => {
            assert.fail("EEAR MSG Received");
          });
          try {
            await emitter.emitEventAndReturn(
              obs,
              thisCaller,
              thisEvent2,
              maxTimeoutToExpectAResponse / 1000,
              [typeToTest.data],
            );
            clearTimeout(emitTimeout);
            assert.fail("EEAR Returned");
          }
          catch (exc) {
            clearTimeout(emitTimeout);
            assert.ok("Timeout of EEAR");
          }
        });
        it("should timeout correctly - general timeout", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const obs = createTestObservable();

          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, timermaxTimeoutToExpectAResponse + 10);
          await emitter.onReturnableEvent(
            obs,
            thisCaller,
            thisEvent,
            async () => {
            },
          );
          try {
            await emitter.emitEventAndReturn(
              obs,
              thisCaller,
              thisEvent,
              maxTimeoutToExpectAResponse / 1000,
              [typeToTest.data],
            );
            clearTimeout(emitTimeout);
            assert.fail("EEAR Returned");
          }
          catch (exc) {
            clearTimeout(emitTimeout);
            assert.ok("Timeout of EEAR");
          }
        });
        it("should timeout correctly - no receipt", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const obs = createTestObservable();

          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, timermaxTimeoutToExpectAResponse + 10);
          try {
            await emitter.emitEventAndReturn(
              obs,
              thisCaller,
              thisEvent,
              maxTimeoutToExpectAResponse / 1000,
              [typeToTest.data],
            );
            clearTimeout(emitTimeout);
            assert.fail("EEAR Returned");
          }
          catch (exc) {
            clearTimeout(emitTimeout);
            assert.ok("Timeout of EEAR");
          }
        });
        it("should response error correctly", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const obs = createTestObservable();

          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, timermaxTimeoutToExpectAResponse);
          await emitter.onReturnableEvent(obs, thisCaller, thisEvent, () => {
            throw typeToTest.rData || typeToTest.data;
          });
          try {
            await emitter.emitEventAndReturn(
              obs,
              thisCaller,
              thisEvent,
              maxTimeoutToExpectAResponse / 1000,
              [typeToTest.data],
            );
            clearTimeout(emitTimeout);
            assert.fail("EEAR Returned");
          }
          catch (exc) {
            clearTimeout(emitTimeout);
            assert.ok("EEAR");
            assert.strictEqual(
              JSON.stringify(exc),
              JSON.stringify(typeToTest.rData || typeToTest.data),
            );
          }
        });
      });
    }
  });
}
