import * as fs from "fs";
import * as crypto from "crypto";
import { exec } from "child_process";
import { pipeline } from "stream";
import { Readable } from "stream";
import * as assert from "assert";
import { BSBEvents, SmartFunctionCallSync, DTrace } from "../../../../index";
import { randomUUID } from "crypto";

const randomName = () => crypto.randomUUID();
const createTrace = (): DTrace => ({ t: randomUUID(), s: randomUUID() });

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
    destroy: () => {
    },
  };
  return obj;
};

const getFileHash = (filename: any) =>
  new Promise((resolve, reject) => {
    const fd = fs.createReadStream(filename);
    // deepcode ignore InsecureHash/test: not production, just using to verify the files hash
    const hash = crypto.createHash("sha1");
    hash.setEncoding("hex");

    fd.on("error", reject);
    fd.on("end", () => {
      hash.end();
      resolve(hash.read());
    });

    // read all file and pipe it (write it) to the hash object
    fd.pipe(hash);
  });

const runCMD = (cmd: string) =>
  new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        // node couldn't execute the command
        return reject(err);
      }

      // the *entire* stdout and stderr (buffered)
      resolve({
        stdout,
        stderr,
      });
    });
  });

// const convertBytes = (
//   bytes: number,
//   sizes = [
//     "Bytes",
//     "KB",
//     "MB",
//     "GB",
//     "TB",
//   ],
// ) => {
//   if (bytes == 0) {
//     return "n/a";
//   }

//   //const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
//   const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024))
//     .toString());

//   if (i == 0) {
//     return bytes + " " + sizes[i];
//   }

//   return (
//     bytes / Math.pow(1024, i)
//   ).toFixed(1) + " " + sizes[i];
// };

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
    //this.timeout(maxTimeoutToExpectAResponse + 20);
    //this.afterEach(done => setTimeout(done, maxTimeoutToExpectAResponse));
    const timermaxTimeoutToExpectAResponse = maxTimeoutToExpectAResponse + 10;
    it("receiveStream creates a should generate a valid string", async () => {
      const thisCaller = randomName();
      const trace = createTrace();

      const uuid = await emitter.receiveStream(
        trace,
        thisCaller,
        async (receivedTrace: DTrace, error: Error | null, stream: Readable) => {
        },
        maxTimeoutToExpectAResponse,
      );
      assert.ok(`${ uuid }`.length >= 10, "Not a valid unique ID for stream");
    });
    it("sendStream triggers timeout when no receiveStream setup", async () => {
      const thisCaller = randomName();
      const thisEvent = randomName();
      const trace = createTrace();

      try {
        await emitter.sendStream(trace, thisCaller, thisEvent, mockBareFakeStream());
        assert.fail("Timeout not called");
      }
      catch {
        assert.ok(true, "Timeout called exception");
      }
    });
    it("sendStream triggers receiveStream listener", async () => {
      const thisCaller = randomName();
      const trace = createTrace();

      const emitTimeout = setTimeout(() => {
        assert.fail("Event not received");
      }, timermaxTimeoutToExpectAResponse);
      const uuid = await emitter.receiveStream(
        trace,
        thisCaller,
        async (receivedTrace: DTrace, error: Error | null, stream: Readable) => {
          clearTimeout(emitTimeout);
          stream.emit("end");
          assert.ok(true, "Listener called");
        },
        maxTimeoutToExpectAResponse,
      );
      try {
        await emitter.sendStream(trace, thisCaller, uuid, mockBareFakeStream());
        //console.log("endededed");
        // eslint-disable-next-line no-empty
      }
      catch {
      }
    });
    describe("sendStream triggers receiveStream listener passing in the stream", async () => {
      it("should not call the listener with an error", async () => {
        const thisCaller = randomName();
        const trace = createTrace();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, timermaxTimeoutToExpectAResponse);
        const uuid = await emitter.receiveStream(
          trace,
          thisCaller,
          async (receivedTrace: DTrace, error: Error | null, stream: Readable) => {
            clearTimeout(emitTimeout);
            stream.emit("end");
            assert.strictEqual(error, null, "Error is not null");
          },
          maxTimeoutToExpectAResponse,
        );
        try {
          await emitter.sendStream(trace, thisCaller, uuid, mockBareFakeStream());
          // eslint-disable-next-line no-empty
        }
        catch {
        }
      });
      it("should call the listener with a stream", async () => {
        const thisCaller = randomName();
        const trace = createTrace();

        const emitTimeout = setTimeout(() => {
          assert.fail("Event not received");
        }, timermaxTimeoutToExpectAResponse);
        const uuid = await emitter.receiveStream(
          trace,
          thisCaller,
          async (receivedTrace: DTrace, error: Error | null, stream: Readable) => {
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
          await emitter.sendStream(trace, thisCaller, uuid, mockBareFakeStream());
          // eslint-disable-next-line no-empty
        }
        catch {
        }
      });
    });
    describe("sendStream triggers receiveStream files", function () {
      this.timeout(120000);
      const runTest = async (size: string, count = 1) => {
        it(`should be able to fully stream a file - ${ size }`, async () => {
          this.timeout(120000);
          const thisCaller = randomName();
          const trace = createTrace();
          //const now = new Date().getTime();
          const fileName = `./test-file-${ size }`;
          const fileNameOut = fileName + "-out";
          try {
            await runCMD(
              `dd if=/dev/urandom of=${ fileName } bs=${ size } count=${ count }`,
            );
            /*fs.writeFileSync(fileName, 'XX');
             for (let x = 0; x < itr1; x++) {
             let fileBatch = crypto.randomUUID();
             for (let x = 0; x < itr2; x++)
             fileBatch += crypto.randomUUID();
             //console.log('batch:' + x)
             await new Promise((r, re) => fs.appendFile(fileName, fileBatch, (err) => ((err ? re : r)())));
             }*/
            //const fileBytes = fs.statSync(fileName).size;
            //const fullBytes = convertBytes(fileBytes);
            //console.log(` ${size} act size: ${fullBytes}`);
            const srcFileHash = await getFileHash(fileName);

            const emitTimeout = setTimeout(() => {
              assert.fail("Event not received");
            }, timermaxTimeoutToExpectAResponse);
            const uuid = await emitter.receiveStream(
              trace,
              thisCaller,
              async (receivedTrace: DTrace, error: Error | null, stream: Readable): Promise<any> => {
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
              trace,
              thisCaller,
              uuid,
              fs.createReadStream(fileName),
            );
            fs.unlinkSync(fileName);
            assert.strictEqual(
              await getFileHash(fileNameOut),
              srcFileHash,
              "Validate data equals",
            );
            fs.unlinkSync(fileNameOut);
            //const done = new Date().getTime();
            //const totalTimeMS = done - now;
            // const bytesPerSecond = fileBytes / (
            //   totalTimeMS / 1000
            // );
            // console.log(
            //     ` ${size} act size: ${fullBytes} as ${convertBytes(
            //         bytesPerSecond,
            //         [
            //           "bps",
            //           "kbps",
            //           "mbps",
            //           "gbps",
            //           "tbps",
            //         ],
            //     )} in ${totalTimeMS}ms`,
            // );
          }
          catch (xx: any) {
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
      //runTest("128MB", 1);

      //runTest("128MB", 4);
      //runTest('512MB', 16);
      //runTest('1GB', 32);
      //runTest('5GB', 160);
      //runTest('12GB', 384);
    });
  });
}