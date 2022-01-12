const assert = require('assert');
const fs = require('fs');
const pipeline = require('stream').pipeline;
const crypto = require('crypto');
const {
  exec
} = require('child_process');

const randomName = () => crypto.randomUUID();

const mockBareFakeStream = () => {
  let obj = {
    listeners: {},
    emit: (name) => {
      if (obj.listeners[name] !== undefined)
        obj.listeners[name]();
    },
    on: (name, listn) => {
      obj.listeners[name] = listn;
    },
    destroy: () => {}
  };
  return obj;
}

const getFileHash = (filename) => new Promise((resolve, reject) => {
  var fd = fs.createReadStream(filename);
  var hash = crypto.createHash('sha1');
  hash.setEncoding('hex');

  fd.on('error', reject);
  fd.on('end', () => {
    hash.end();
    resolve(hash.read());
  });

  // read all file and pipe it (write it) to the hash object
  fd.pipe(hash);
});

const runCMD = (cmd) => new Promise((resolve, reject) => {
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      // node couldn't execute the command
      return reject(err);
    }

    // the *entire* stdout and stderr (buffered)
    resolve({
      stdout,
      stderr
    });
  });
});

const convertBytes = (bytes, sizes = ["Bytes", "KB", "MB", "GB", "TB"]) => {
  if (bytes == 0) {
    return "n/a"
  }

  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)))

  if (i == 0) {
    return bytes + " " + sizes[i]
  }

  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i]
}

exports.default = (genNewPlugin, maxTimeoutToExpectAResponse) => describe('EmitStreamAndReceiveStream', async () => {
  //this.timeout(maxTimeoutToExpectAResponse + 20);
  //this.afterEach(done => setTimeout(done, maxTimeoutToExpectAResponse));
  const timermaxTimeoutToExpectAResponse = maxTimeoutToExpectAResponse + 10;
  describe('receiveStream creates an ID', async () => {
    it('should generate a valid string', async () => {
      const thisCaller = randomName();
      const emitter = await genNewPlugin();
      let uuid = await emitter.receiveStream(thisCaller, () => {}, maxTimeoutToExpectAResponse);
      assert.ok(`${uuid}`.length >= 10, 'Not a valid unique ID for stream');
    });
  });
  describe('sendStream triggers timeout when no receiveStream setup', async () => {
    it('timeout and generate an exception', async () => {
      const thisEvent = randomName();
      const emitter = await genNewPlugin();
      try {
        await emitter.sendStream(thisCaller, thisEvent, mockBareFakeStream());
        assert.fail('Timeout not called')
      } catch (xc) {
        assert.ok(true, 'Timeout called exception')
      }
    });
  });
  describe('sendStream triggers receiveStream listener', async () => {
    it('should call the listener', async () => {
      const thisCaller = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, timermaxTimeoutToExpectAResponse);
      let uuid = await emitter.receiveStream(thisCaller, (err, stream) => {
        clearTimeout(emitTimeout);
        stream.emit('end');
        assert.ok(true, 'Listener called');
      }, maxTimeoutToExpectAResponse);
      try {
        await emitter.sendStream(thisCaller, uuid, mockBareFakeStream());
      } catch (xx) {}
    });
  });
  describe('sendStream triggers receiveStream listener passing in the stream', async () => {
    it('should not call the listener with an error', async () => {
      const thisCaller = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, timermaxTimeoutToExpectAResponse);
      let uuid = await emitter.receiveStream(thisCaller, (err, stream) => {
        clearTimeout(emitTimeout);
        stream.emit('end');
        assert.strictEqual(err, null, 'Error is not null');
      }, maxTimeoutToExpectAResponse);
      try {
        await emitter.sendStream(thisCaller, uuid, mockBareFakeStream());
      } catch (xx) {}
    });
    it('should call the listener with a stream', async () => {
      const thisCaller = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, timermaxTimeoutToExpectAResponse);
      let uuid = await emitter.receiveStream(thisCaller, (err, stream) => {
        clearTimeout(emitTimeout);
        stream.emit('end');
        assert.strictEqual(typeof stream, typeof mockBareFakeStream(), 'Listener called');
      }, maxTimeoutToExpectAResponse);
      try {
        await emitter.sendStream(thisCaller, uuid, mockBareFakeStream());
      } catch (xx) {}
    });
  });
  describe('sendStream triggers receiveStream files', function() {
    this.timeout(120000);
    const runTest = async (size, count = 1) => {
      it(`should be able to fully stream a file - ${size}`, async () => {
        const thisCaller = randomName();
        const now = new Date().getTime();
        let fileName = `./test-file-${size}`;
        let fileNameOut = fileName + '-out';
        try {
          await runCMD(`dd if=/dev/urandom of=${fileName} bs=${size} count=${count}`);
          /*fs.writeFileSync(fileName, 'XX');
          for (let x = 0; x < itr1; x++) {
            let fileBatch = crypto.randomUUID();
            for (let x = 0; x < itr2; x++)
              fileBatch += crypto.randomUUID();
            //console.log('batch:' + x)
            await new Promise((r, re) => fs.appendFile(fileName, fileBatch, (err) => ((err ? re : r)())));
          }*/
          const fileBytes = fs.statSync(fileName).size;
          const fullBytes = convertBytes(fileBytes);
          console.log(` ${size} act size: ${fullBytes}`);
          let srcFileHash = await getFileHash(fileName);
          const emitter = await genNewPlugin();
          const emitTimeout = setTimeout(() => {
            assert.fail('Event not received');
          }, timermaxTimeoutToExpectAResponse);
          let uuid = await emitter.receiveStream(thisCaller, (err, stream) => {
            clearTimeout(emitTimeout);
            pipeline(stream, fs.createWriteStream(fileNameOut), (err) => {
              if (err)
                assert.fail(err);
            });
          }, maxTimeoutToExpectAResponse);
          await emitter.sendStream(thisCaller, uuid, fs.createReadStream(fileName));
          fs.unlinkSync(fileName);
          assert.strictEqual(await getFileHash(fileNameOut), srcFileHash, 'Validate data equals');
          fs.unlinkSync(fileNameOut);
          const done = new Date().getTime();
          const totalTimeMS = (done - now);
          const bytesPerSecond = (fileBytes / (totalTimeMS / 1000));
          console.log(` ${size} act size: ${fullBytes} as ${convertBytes(bytesPerSecond, ["bps", "kbps", "mbps", "gbps", "tbps"])} in ${totalTimeMS}ms`);
        } catch (xx) {
          if (fs.existsSync(fileName))
            fs.unlinkSync(fileName);
          if (fs.existsSync(fileNameOut))
            fs.unlinkSync(fileNameOut);
          assert.fail(xx);
        }
      });
    }
    runTest('1KB');
    runTest('16KB');
    runTest('128KB');
    runTest('512KB');
    runTest('1MB');
    runTest('16MB');
    runTest('128MB', 4);
    //runTest('512MB', 16);
    //runTest('1GB', 32);
    //runTest('5GB', 160);
    //runTest('12GB', 384);
  });
});

// emitter.receiveStream(thisCaller, thisPlugin, thisEvent, listener: { (error: Error | null, stream: Readable): void; }): string
// sendStream(callerPluginName: string, pluginName: string, event: string, streamId: string, stream: Readable, timeout = 60): Promise<void>