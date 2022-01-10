const assert = require('assert');
const crypto = require('crypto');

const randomName = () => crypto.randomUUID();

exports.default = (genNewPlugin, maxTimeoutToExpectAResponse) => describe('EmitAndReturn', async () => {
  this.timeout(maxTimeoutToExpectAResponse + 20);
  this.afterEach(done => setTimeout(done, maxTimeoutToExpectAResponse));
  const timermaxTimeoutToExpectAResponse = maxTimeoutToExpectAResponse + 10;
  describe('emitEventAndReturn', async () => {
    const emitData = true;
    const emitData2 = false;
    it('should be able to emit to events with plugin name defined', async () => {
      const thisCaller = randomName();
      const thisPlugin = randomName();
      const thisEvent = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, timermaxTimeoutToExpectAResponse);
      emitter.onReturnableEvent(thisCaller, thisPlugin, thisEvent, (resolve, reject, data) => {
        assert.ok(true, 'Received onEvent');
        resolve(emitData2);
      });
      const resp = await emitter.emitEventAndReturn(thisCaller, thisPlugin, thisEvent, {}, maxTimeoutToExpectAResponse / 1000);
      clearTimeout(emitTimeout);
      assert.ok(true, 'Received Response');
    });
    it('should be able to emit to events with self', async () => {
      const thisCaller = randomName();
      const thisPlugin = randomName();
      const thisEvent = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, timermaxTimeoutToExpectAResponse);
      emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {
        assert.ok(true, 'Received onEvent');
        resolve(emitData2);
      });
      const resp = await emitter.emitEventAndReturn(thisCaller, null, thisEvent, emitData, maxTimeoutToExpectAResponse / 1000);
      clearTimeout(emitTimeout);
      assert.ok(true, 'Received Response');
    });
    it('should not be able to emit to other events with plugin name defined', async () => {
      const thisCaller = randomName();
      const thisPlugin = randomName();
      const thisEvent = randomName();
      const thisEvent2 = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.ok(true);
      }, timermaxTimeoutToExpectAResponse);
      emitter.onReturnableEvent(thisCaller, thisPlugin, thisEvent, (resolve, reject, data) => {
        assert.fail('EEAR MSG Received');
      });
      try {
        await emitter.emitEventAndReturn(thisCaller, thisPlugin, thisEvent2, emitData, maxTimeoutToExpectAResponse / 1000);
        clearTimeout(emitTimeout);
        assert.fail('EEAR Returned');
      } catch (exc) {
        clearTimeout(emitTimeout);
        assert.ok('Timeout of EEAR');
      }
    });
    it('should not be able to emit to other events with self', async () => {
      const thisCaller = randomName();
      const thisEvent = randomName();
      const thisEvent2 = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.ok(true);
      }, timermaxTimeoutToExpectAResponse);
      emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {
        assert.fail('EEAR MSG Received');
      });
      try {
        await emitter.emitEventAndReturn(thisCaller, null, thisEvent2, emitData, maxTimeoutToExpectAResponse / 1000);
        clearTimeout(emitTimeout);
        assert.fail('EEAR Returned');
      } catch (exc) {
        clearTimeout(emitTimeout);
        assert.ok('Timeout of EEAR');
      }
    });
    it('should timeout correctly', async () => {
      const thisCaller = randomName();
      const thisPlugin = randomName();
      const thisEvent = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, timermaxTimeoutToExpectAResponse);
      emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {
        //assert.ok(true, 'Received onEvent');
        //resolve(emitData2);
      });
      try {
        await emitter.emitEventAndReturn(thisCaller, null, thisEvent, emitData, maxTimeoutToExpectAResponse / 1000);
        clearTimeout(emitTimeout);
        assert.fail('EEAR Returned');
      } catch (exc) {
        clearTimeout(emitTimeout);
        assert.ok('Timeout of EEAR');
      }
    });
    it('should response error correctly', async () => {
      const thisCaller = randomName();
      const thisPlugin = randomName();
      const thisEvent = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, timermaxTimeoutToExpectAResponse);
      emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {
        //assert.ok(true, 'Received onEvent');
        //resolve(emitData2);
        reject('THISISANERROR')
      });
      try {
        await emitter.emitEventAndReturn(thisCaller, null, thisEvent, emitData, maxTimeoutToExpectAResponse / 1000);
        clearTimeout(emitTimeout);
        assert.fail('EEAR Returned');
      } catch (exc) {
        clearTimeout(emitTimeout);
        assert.ok('EEAR');
        assert.strictEqual(exc, 'THISISANERROR');
      }
    });
  });
  const typesToTest = [{
      name: 'DiffData',
      data: null,
      rData: 'HELLO WORLD'
    }, {
      name: 'Null',
      data: null
    },
    {
      name: 'Boolean true',
      data: true
    },
    {
      name: 'Boolean false',
      data: false
    },
    {
      name: 'String',
      data: 'HELLO WO4lD'
    },
    {
      name: 'Min Number',
      data: Number.MIN_SAFE_INTEGER
    },
    {
      name: 'Max Number',
      data: Number.MAX_SAFE_INTEGER
    },
    {
      name: 'Array',
      data: [0, 'Hello', true]
    },
    {
      name: 'Object',
      data: {
        name: 'Sarah',
        surname: 'Blond',
        age: 24,
        meta: {
          location: [-12212, 55336]
        }
      }
    }
  ];
  for (let typeToTest of typesToTest) {
    describe(`emitEventAndReturn ${typeToTest.name}`, async () => {
      it('should be able to emit to events with plugin name defined', async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail('Event not received');
        }, timermaxTimeoutToExpectAResponse);
        emitter.onReturnableEvent(thisCaller, thisPlugin, thisEvent, (resolve, reject, data) => {
          assert.strictEqual(data, typeToTest.data);
          resolve(typeToTest.rData || typeToTest.data);
        });
        const resp = await emitter.emitEventAndReturn(thisCaller, thisPlugin, thisEvent, typeToTest.data, maxTimeoutToExpectAResponse / 1000);
        clearTimeout(emitTimeout);
        assert.strictEqual(resp, typeToTest.rData || typeToTest.data);
      });
      it('should be able to emit to events with self', async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail('Event not received');
        }, timermaxTimeoutToExpectAResponse);
        emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {
          assert.strictEqual(data, typeToTest.data, "Received data");
          resolve(typeToTest.rData || typeToTest.data);
        });
        const resp = await emitter.emitEventAndReturn(thisCaller, null, thisEvent, typeToTest.data, maxTimeoutToExpectAResponse / 1000);
        clearTimeout(emitTimeout);
        assert.strictEqual(resp, typeToTest.rData || typeToTest.data, "returned data");
      });
      it('should not be able to emit to other events with plugin name defined', async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, timermaxTimeoutToExpectAResponse);
        emitter.onReturnableEvent(thisCaller, thisPlugin, thisEvent, (resolve, reject, data) => {
          assert.fail('EEAR MSG Received');
        });
        try {
          await emitter.emitEventAndReturn(thisCaller, thisPlugin, thisEvent2, typeToTest.data, maxTimeoutToExpectAResponse / 1000);
          clearTimeout(emitTimeout);
          assert.fail('EEAR Returned');
        } catch (exc) {
          clearTimeout(emitTimeout);
          assert.ok('Timeout of EEAR');
        }
      });
      it('should not be able to emit to other events with self', async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, timermaxTimeoutToExpectAResponse);
        emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {
          assert.fail('EEAR MSG Received');
        });
        try {
          await emitter.emitEventAndReturn(thisCaller, null, thisEvent2, typeToTest.data, maxTimeoutToExpectAResponse / 1000);
          clearTimeout(emitTimeout);
          assert.fail('EEAR Returned');
        } catch (exc) {
          clearTimeout(emitTimeout);
          assert.ok('Timeout of EEAR');
        }
      });
      it('should timeout correctly', async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail('Event not received');
        }, timermaxTimeoutToExpectAResponse);
        emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {
          //assert.ok(true, 'Received onEvent');
          //resolve(emitData2);
        });
        try {
          await emitter.emitEventAndReturn(thisCaller, null, thisEvent, typeToTest.data, maxTimeoutToExpectAResponse / 1000);
          clearTimeout(emitTimeout);
          assert.fail('EEAR Returned');
        } catch (exc) {
          clearTimeout(emitTimeout);
          assert.ok('Timeout of EEAR');
        }
      });
      it('should response error correctly', async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail('Event not received');
        }, timermaxTimeoutToExpectAResponse);
        emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {
          //assert.ok(true, 'Received onEvent');
          //resolve(emitData2);
          assert.strictEqual(data, typeToTest.data);
          reject(typeToTest.rData || typeToTest.data);
        });
        try {
          await emitter.emitEventAndReturn(thisCaller, null, thisEvent, typeToTest.data, maxTimeoutToExpectAResponse / 1000);
          clearTimeout(emitTimeout);
          assert.fail('EEAR Returned');
        } catch (exc) {
          clearTimeout(emitTimeout);
          assert.ok('EEAR');
          assert.strictEqual(exc, typeToTest.rData || typeToTest.data);
        }
      });
    });
  }
});