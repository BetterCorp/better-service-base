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

import * as fs from "fs";
import * as crypto from "crypto";
import { pipeline, Readable } from "stream";
import * as assert from "assert";
import { BSBEvents, Observable, SmartFunctionCallSync } from "@bsb/base";
import { createTestObservable } from "../../../trace.js";

const randomName = () => crypto.randomUUID();

const mockBareFakeStream = () => {
  const obj: any = {
    listeners: {},
    emit: (name: any, data?: any) => {
      if (obj.listeners[name] !== undefined) {
        obj.listeners[name](data);
      }
    },
    on: (name: any, listn: any) => {
      obj.listeners[name] = listn;
    },
    destroy: () => {},
  };
  return obj;
};

const getFileHash = (filename: any) =>
  new Promise((resolve, reject) => {
    const fd = fs.createReadStream(filename);
    const hash = crypto.createHash("sha1");
    hash.setEncoding("hex");

    fd.on("error", reject);
    fd.on("end", () => {
      hash.end();
      resolve(hash.read());
    });

    fd.pipe(hash);
  });

const createTestFile = (filePath: string, sizeStr: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const match = sizeStr.match(/^(\d+)(KB|MB)$/);
    if (!match) {
      return reject(new Error(`Invalid size format: ${sizeStr}`));
    }

    const num = parseInt(match[1], 10);
    const unit = match[2];
    const sizeBytes = unit === "KB" ? num * 1024 : num * 1024 * 1024;

    const writeStream = fs.createWriteStream(filePath);
    const chunkSize = 64 * 1024;
    let written = 0;

    const writeChunk = () => {
      while (written < sizeBytes) {
        const remaining = sizeBytes - written;
        const size = Math.min(chunkSize, remaining);
        const buffer = crypto.randomBytes(size);

        const canContinue = writeStream.write(buffer);
        written += size;

        if (!canContinue) {
          writeStream.once("drain", writeChunk);
          return;
        }
      }

      writeStream.end();
    };

    writeStream.on("finish", () => resolve());
    writeStream.on("error", reject);

    writeChunk();
  });
};

export function emitStreamAndReceiveStream(
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
  describe("EmitStreamAndReceiveStream", async () => {
    const timermaxTimeoutToExpectAResponse = maxTimeoutToExpectAResponse + 10;
    it("receiveStream creates a should generate a valid string", async () => {
      const thisCaller = randomName();
      const thisCallerEvent = randomName();
      const obs = createTestObservable();

      const uuid = await emitter.receiveStream(
        obs,
        thisCaller,
        thisCallerEvent,
        async (receivedObs: Observable, error: Error | null, stream: Readable) => {},
        maxTimeoutToExpectAResponse,
      );
      assert.ok(`${uuid}`.length >= 10, "Not a valid unique ID for stream");
    });
    it("sendStream triggers timeout when no receiveStream setup", async () => {
      const thisCaller = randomName();
      const thisEvent = randomName();
      const streamId = `${randomName()}=1`;
      const obs = createTestObservable();

      try {
        await emitter.sendStream(obs, thisCaller, thisEvent, streamId, mockBareFakeStream());
        assert.fail("Timeout not called");
      } catch {
        assert.ok(true, "Timeout called exception");
      }
    });
    it("sendStream triggers receiveStream listener", async () => {
      const thisCaller = randomName();
      const thisCallerEvent = randomName();
      const obs = createTestObservable();

      const emitTimeout = setTimeout(() => {
        assert.fail("Event not received");
      }, timermaxTimeoutToExpectAResponse);
      const uuid = await emitter.receiveStream(
        obs,
        thisCaller,
        thisCallerEvent,
        async (receivedObs: Observable, error: Error | null, stream: Readable) => {
          clearTimeout(emitTimeout);
          stream.emit("end");
          assert.ok(true, "Listener called");
        },
        maxTimeoutToExpectAResponse,
      );
      try {
        await emitter.sendStream(obs, thisCaller, thisCallerEvent, uuid, mockBareFakeStream());
      } catch {}
    });
    describe("sendStream triggers receiveStream listener passing in the stream", async () => {
      it("should not call the listener with an error", async () => {
        const thisCaller = randomName();
        const thisCallerEvent = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, timermaxTimeoutToExpectAResponse);
        const uuid = await emitter.receiveStream(
          obs,
          thisCaller,
          thisCallerEvent,
          async (receivedObs: Observable, error: Error | null, stream: Readable) => {
            clearTimeout(emitTimeout);
            stream.emit("end");
            assert.strictEqual(error, null, "Error is not null");
          },
          maxTimeoutToExpectAResponse,
        );
        try {
          await emitter.sendStream(obs, thisCaller, thisCallerEvent, uuid, mockBareFakeStream());
        } catch {}
      });
      it("should call the listener with a stream", async () => {
        const thisCaller = randomName();
        const thisCallerEvent = randomName();
        const obs = createTestObservable();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, timermaxTimeoutToExpectAResponse);
        const uuid = await emitter.receiveStream(
          obs,
          thisCaller,
          thisCallerEvent,
          async (receivedObs: Observable, error: Error | null, stream: Readable) => {
            clearTimeout(emitTimeout);
            stream.emit("end");
            assert.strictEqual(
              typeof stream,
              typeof mockBareFakeStream(),
              "Listener called",
            );
          },
          maxTimeoutToExpectAResponse,
        );
        try {
          await emitter.sendStream(obs, thisCaller, thisCallerEvent, uuid, mockBareFakeStream());
        } catch {}
      });
    });
    describe("sendStream triggers receiveStream files", function (this: Mocha.Suite) {
      this.timeout(120000);
      const runTest = async (size: string, count = 1) => {
        it(`should be able to fully stream a file - ${size}`, async function (this: Mocha.Context) {
          this.timeout(120000);
          const thisCaller = randomName();
          const thisCallerEvent = randomName();
          const obs = createTestObservable();
          const fileName = `./test-file-${size}`;
          const fileNameOut = fileName + "-out";
          try {
            await createTestFile(fileName, size);
            const srcFileHash = await getFileHash(fileName);

            const emitTimeout = setTimeout(() => {
              assert.fail("Event not received");
            }, timermaxTimeoutToExpectAResponse);
            const uuid = await emitter.receiveStream(
              obs,
              thisCaller,
              thisCallerEvent,
              async (receivedObs: Observable, error: Error | null, stream: Readable): Promise<any> => {
                if (error) {
                  return assert.fail(error);
                }
                clearTimeout(emitTimeout);
                pipeline(stream, fs.createWriteStream(fileNameOut), (errf) => {
                  if (errf) {
                    assert.fail(errf);
                  }
                });
              },
              maxTimeoutToExpectAResponse,
            );
            await emitter.sendStream(
              obs,
              thisCaller,
              thisCallerEvent,
              uuid,
              fs.createReadStream(fileName),
            );
            fs.unlinkSync(fileName);
            assert.strictEqual(await getFileHash(fileNameOut), srcFileHash, "Validate data equals");
            fs.unlinkSync(fileNameOut);
          } catch (xx: any) {
            if (fs.existsSync(fileName)) {
              fs.unlinkSync(fileName);
            }
            if (fs.existsSync(fileNameOut)) {
              fs.unlinkSync(fileNameOut);
            }
            assert.fail(xx.toString());
          }
        });
      };
      runTest("1KB");
      runTest("16KB");
      runTest("128KB");
      runTest("512KB");
      runTest("1MB");
      runTest("16MB");
    });
  });
}
