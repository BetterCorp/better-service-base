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

import * as assert from "assert";
import {randomUUID} from "crypto";
import {BSBEvents, SmartFunctionCallSync, Observable} from "../../../../index";
import { createTestObservable } from "../../../trace";

const randomName = () => randomUUID();

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
    this.timeout(maxTimeoutToExpectAResponse + 100);
    describe("emitEvent", async () => {
      const emitData = true;
      it("only one plugin should receive the event", async () => {
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const obs = createTestObservable();
        let receiveCounter = 0;
        await emitter.onEvent(obs, thisPlugin, thisEvent, async (receivedObs: Observable, args: any[]) => {
          assert.strictEqual(receivedObs.traceId, obs.traceId);
          receiveCounter++;
        });
        await emitter.onEvent(obs, thisPlugin, thisEvent, async (receivedObs: Observable, args: any[]) => {
          assert.strictEqual(receivedObs.traceId, obs.traceId);
          receiveCounter++;
        });
        await emitter.emitEvent(obs, thisPlugin, thisEvent, [emitData]);
        await new Promise(resolve => setTimeout(resolve, 10));
        if (receiveCounter === 1) {
          return assert.ok(receiveCounter);
        }
        if (receiveCounter === 0) {
          return assert.fail("Event not received");
        }
        assert.fail("Received " + receiveCounter + " events");
      });
      it("diff plugin names should not receive same event", async () => {
        const thisPlugin = randomName();
        const thisPlugin2 = randomName();
        const thisEvent = randomName();
        const obs = createTestObservable();
        let receiveCounter = 0;
        await emitter.onEvent(obs, thisPlugin, thisEvent, async () => {
          assert.fail("Received on diff plugin name");
        });
        await emitter.onEvent(obs, thisPlugin2, thisEvent, async (receivedObs: Observable, args: any[]) => {
          assert.strictEqual(receivedObs.traceId, obs.traceId);
          receiveCounter++;
        });
        await emitter.onEvent(obs, thisPlugin2, thisEvent, async (receivedObs: Observable, args: any[]) => {
          assert.strictEqual(receivedObs.traceId, obs.traceId);
          receiveCounter++;
        });
        await emitter.emitEvent(obs, thisPlugin2, thisEvent, [emitData]);
        await new Promise(resolve => setTimeout(resolve, 10));
        if (receiveCounter === 1) {
          return assert.ok(receiveCounter);
        }
        if (receiveCounter === 0) {
          return assert.fail("Event not received");
        }
        assert.fail("Received " + receiveCounter + " events");
      });
      it("should be able to emit to events with plugin name defined", async () => {
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const obs = createTestObservable();
        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(obs, thisPlugin, thisEvent, async (receivedObs: Observable, data: any[]) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(receivedObs.traceId, obs.traceId);
          assert.ok(data[0]);
        });
        await emitter.emitEvent(obs, thisPlugin, thisEvent, [emitData]);
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      it("should be able to emit to events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(obs, thisCaller, thisEvent, async (receivedObs: Observable, data: any[]) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(receivedObs.traceId, obs.traceId);
          assert.ok(data[0]);
        });
        await emitter.emitEvent(obs, thisCaller, thisEvent, [emitData]);
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      it("should be able to emit to events with self multi-args", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(obs, thisCaller, thisEvent, async (receivedObs: Observable, data: any[]) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(receivedObs.traceId, obs.traceId);
          assert.deepEqual(data[0], 0);
          assert.deepEqual(data[1], 1);
          assert.deepEqual(data[2], 2);
          assert.deepEqual(data[3], 3);
        });
        await emitter.emitEvent(obs, thisCaller, thisEvent, [0, 1, 2, 3]);
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      it("should not be able to emit to other events with plugin name defined", async () => {
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(obs, thisPlugin, thisEvent, async () => {
          clearTimeout(emitTimeout);
          assert.fail("Event received");
        });
        await emitter.emitEvent(obs, thisPlugin, thisEvent2, [emitData]);
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      it("should not be able to emit to other events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(obs, thisCaller, thisEvent, async () => {
          clearTimeout(emitTimeout);
          assert.fail("Event received");
        });
        await emitter.emitEvent(obs, thisCaller, thisEvent2, [emitData]);
        await new Promise(resolve => setTimeout(resolve, 10));
      });
    });
    describe("onEvent", async () => {
      const emitData = "ABCD";
      it("should be able to emit to events with plugin name defined", async () => {
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(obs, thisPlugin, thisEvent, async (receivedObs: Observable, data: any[]) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(receivedObs.traceId, obs.traceId);
          assert.deepEqual(data[0], emitData);
        });
        await emitter.emitEvent(obs, thisPlugin, thisEvent, [emitData]);
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      it("should be able to emit to events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(obs, thisCaller, thisEvent, async (receivedObs: Observable, data: any[]) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(receivedObs.traceId, obs.traceId);
          assert.deepEqual(data[0], emitData);
        });
        await emitter.emitEvent(obs, thisCaller, thisEvent, [emitData]);
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      it("should not be able to emit to other events with plugin name defined", async () => {
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(obs, thisPlugin, thisEvent, async () => {
          clearTimeout(emitTimeout);
          assert.fail("Event received");
        });
        await emitter.emitEvent(obs, thisPlugin, thisEvent2, [emitData]);
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      it("should not be able to emit to other events with self", async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(obs, thisCaller, thisEvent, async () => {
          clearTimeout(emitTimeout);
          assert.fail("Event received");
        });
        await emitter.emitEvent(obs, thisCaller, thisEvent2, [emitData]);
        await new Promise(resolve => setTimeout(resolve, 10));
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
          const obs = createTestObservable();

          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, maxTimeoutToExpectAResponse);
          await emitter.onEvent(obs, thisPlugin, thisEvent, async (receivedObs: Observable, data: any[]) => {
            clearTimeout(emitTimeout);
            assert.strictEqual(receivedObs.traceId, obs.traceId);
            assert.deepEqual(data[0], typeToTest.data);
          });
          await emitter.emitEvent(obs, thisPlugin, thisEvent, [typeToTest.data]);
          await new Promise(resolve => setTimeout(resolve, 10));
        });
        it("should be able to emit to events with self", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const obs = createTestObservable();

          const emitTimeout = setTimeout(() => {
            assert.fail("Event not received");
          }, maxTimeoutToExpectAResponse);
          await emitter.onEvent(obs, thisCaller, thisEvent, async (receivedObs: Observable, data: any[]) => {
            clearTimeout(emitTimeout);
            assert.strictEqual(receivedObs.traceId, obs.traceId);
            assert.deepEqual(data[0], typeToTest.data);
          });
          await emitter.emitEvent(obs, thisCaller, thisEvent, [typeToTest.data]);
          await new Promise(resolve => setTimeout(resolve, 10));
        });
        it("should not be able to emit to other events with plugin name defined", async () => {
          const thisPlugin = randomName();
          const thisEvent = randomName();
          const thisEvent2 = randomName();
          const obs = createTestObservable();

          const emitTimeout = setTimeout(() => {
            assert.ok(true);
          }, maxTimeoutToExpectAResponse);
          await emitter.onEvent(obs, thisPlugin, thisEvent, async () => {
            clearTimeout(emitTimeout);
            assert.fail("Event received");
          });
          await emitter.emitEvent(obs, thisPlugin, thisEvent2, [typeToTest.data]);
          await new Promise(resolve => setTimeout(resolve, 10));
        });
        it("should not be able to emit to other events with self", async () => {
          const thisCaller = randomName();
          const thisEvent = randomName();
          const thisEvent2 = randomName();
          const obs = createTestObservable();

          const emitTimeout = setTimeout(() => {
            assert.ok(true);
          }, maxTimeoutToExpectAResponse);
          await emitter.onEvent(obs, thisCaller, thisEvent, async () => {
            clearTimeout(emitTimeout);
            assert.fail("Event received");
          });
          await emitter.emitEvent(obs, thisCaller, thisEvent2, [typeToTest.data]);
          await new Promise(resolve => setTimeout(resolve, 10));
        });
      });
    }
  });
}