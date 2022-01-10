const assert = require('assert');
const crypto = require('crypto');

const randomName = () => crypto.randomUUID();

exports.default = (genNewPlugin, maxTimeoutToExpectAResponse, a = true, b = true) => describe('EmitAndReturn', async () => {
  //if (a) this.timeout(maxTimeoutToExpectAResponse + 20);
  //if (b) this.afterEach(done => setTimeout(done, maxTimeoutToExpectAResponse));
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
      await emitter.onReturnableEvent(thisCaller, thisPlugin, thisEvent, (resolve, reject, data) => {
        setTimeout(() => {
          console.log('Received onEvent');
          assert.ok(true, 'Received onEvent');
        }, 1)
        resolve(emitData2);
      });
      console.log('!!Received onEvent');
      const resp = await emitter.emitEventAndReturn(thisCaller, thisPlugin, thisEvent, {}, maxTimeoutToExpectAResponse / 1000);
      console.log('++Received onEvent');
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
      await emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {
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
      await emitter.onReturnableEvent(thisCaller, thisPlugin, thisEvent, (resolve, reject, data) => {
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
      await emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {
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
      await emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {});
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
      await emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {
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
        await emitter.onReturnableEvent(thisCaller, thisPlugin, thisEvent, (resolve, reject, data) => {
          resolve(typeToTest.rData || typeToTest.data);
        });
        const resp = await emitter.emitEventAndReturn(thisCaller, thisPlugin, thisEvent, typeToTest.data, maxTimeoutToExpectAResponse / 1000);
        clearTimeout(emitTimeout);
        assert.strictEqual(JSON.stringify(resp), JSON.stringify(typeToTest.rData || typeToTest.data));
      });
      it('should be able to emit to events with self', async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail('Event not received');
        }, timermaxTimeoutToExpectAResponse);
        await emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(JSON.stringify(data), JSON.stringify(typeToTest.data), "Received data");
          resolve(typeToTest.rData || typeToTest.data);
        });
        const resp = await emitter.emitEventAndReturn(thisCaller, null, thisEvent, typeToTest.data, maxTimeoutToExpectAResponse / 1000);
        clearTimeout(emitTimeout);
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
        await emitter.onReturnableEvent(thisCaller, thisPlugin, thisEvent, (resolve, reject, data) => {
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
        await emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {
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
      it('should timeout correctly - general timeout', async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail('Event not received');
        }, timermaxTimeoutToExpectAResponse + 10);
        await emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {});
        try {
          await emitter.emitEventAndReturn(thisCaller, null, thisEvent, typeToTest.data, maxTimeoutToExpectAResponse / 1000);
          clearTimeout(emitTimeout);
          assert.fail('EEAR Returned');
        } catch (exc) {
          clearTimeout(emitTimeout);
          assert.ok('Timeout of EEAR');
        }
      });
      it('should timeout correctly - no receipt', async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail('Event not received');
        }, timermaxTimeoutToExpectAResponse + 10);
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
        await emitter.onReturnableEvent(thisCaller, null, thisEvent, (resolve, reject, data) => {
          reject(typeToTest.rData || typeToTest.data);
        });
        try {
          await emitter.emitEventAndReturn(thisCaller, null, thisEvent, typeToTest.data, maxTimeoutToExpectAResponse / 1000);
          clearTimeout(emitTimeout);
          assert.fail('EEAR Returned');
        } catch (exc) {
          clearTimeout(emitTimeout);
          assert.ok('EEAR');
          assert.strictEqual(JSON.stringify(exc), JSON.stringify(typeToTest.rData || typeToTest.data));
        }
      });
    });
  }
});