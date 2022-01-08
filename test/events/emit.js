const assert = require('assert');

exports.default = (genNewPlugin, maxTimeoutToExpectAResponse) => describe('Emit', async () => {
  describe('emitEvent', async () => {
    const emitData = true;
    it('should be able to emit to events with plugin name defined', async () => {
      const emitter = await genNewPlugin();
      //console.log(emitter)
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, maxTimeoutToExpectAResponse);
      emitter.onEvent('caller', 'plugin', 'event', (data) => {
        clearTimeout(emitTimeout);
        assert.ok(data);
      });
      emitter.emitEvent('caller', 'plugin', 'event', emitData)
    });
    it('should be able to emit to events with self', async () => {
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, maxTimeoutToExpectAResponse);
      emitter.onEvent('caller', null, 'event', (data) => {
        clearTimeout(emitTimeout);
        assert.ok(data);
      });
      emitter.emitEvent('caller', null, 'event', emitData)
    });
    it('should not be able to emit to other events with plugin name defined', async () => {
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.ok(true);
      }, maxTimeoutToExpectAResponse);
      emitter.onEvent('caller', 'plugin', 'event', (data) => {
        clearTimeout(emitTimeout);
        assert.fail('Event received');
      });
      emitter.emitEvent('caller', 'plugin', 'event3', emitData)
    });
    it('should not be able to emit to other events with self', async () => {
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.ok(true);
      }, maxTimeoutToExpectAResponse);
      emitter.onEvent('caller', null, 'event', (data) => {
        clearTimeout(emitTimeout);
        assert.fail('Event received');
      });
      emitter.emitEvent('caller', null, 'event3', emitData)
    });
  });
  describe('onEvent', async () => {
    const emitData = 'ABCD';
    it('should be able to emit to events with plugin name defined', async () => {
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, maxTimeoutToExpectAResponse);
      emitter.onEvent('caller', 'plugin', 'event', (data) => {
        clearTimeout(emitTimeout);
        assert.strictEqual(data, emitData);
      });
      emitter.emitEvent('caller', 'plugin', 'event', emitData)
    });
    it('should be able to emit to events with self', async () => {
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, maxTimeoutToExpectAResponse);
      emitter.onEvent('caller', null, 'event', (data) => {
        clearTimeout(emitTimeout);
        assert.strictEqual(data, emitData);
      });
      emitter.emitEvent('caller', null, 'event', emitData)
    });
    it('should not be able to emit to other events with plugin name defined', async () => {
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.ok(true);
      }, maxTimeoutToExpectAResponse);
      emitter.onEvent('caller', 'plugin', 'event', (data) => {
        clearTimeout(emitTimeout);
        assert.fail('Event received');
      });
      emitter.emitEvent('caller', 'plugin', 'event3', emitData)
    });
    it('should not be able to emit to other events with self', async () => {
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.ok(true);
      }, maxTimeoutToExpectAResponse);
      emitter.onEvent('caller', null, 'event', (data) => {
        clearTimeout(emitTimeout);
        assert.fail('Event received');
      });
      emitter.emitEvent('caller', null, 'event3', emitData)
    });
  });
  const typesToTest = [{
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
  for (let typeToTest of typesToTest)
    describe(`emit ${typeToTest.name}`, async () => {
      it('should be able to emit to events with plugin name defined', async () => {
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail('Event not received');
        }, maxTimeoutToExpectAResponse);
        emitter.onEvent('caller', 'plugin', 'event', (data) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(data, typeToTest.data);
        });
        emitter.emitEvent('caller', 'plugin', 'event', typeToTest.data)
      });
      it('should be able to emit to events with self', async () => {
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail('Event not received');
        }, maxTimeoutToExpectAResponse);
        emitter.onEvent('caller', null, 'event', (data) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(data, typeToTest.data);
        });
        emitter.emitEvent('caller', null, 'event', typeToTest.data)
      });
      it('should not be able to emit to other events with plugin name defined', async () => {
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        emitter.onEvent('caller', 'plugin', 'event', (data) => {
          clearTimeout(emitTimeout);
          assert.fail('Event received');
        });
        emitter.emitEvent('caller', 'plugin', 'event3', typeToTest.data)
      });
      it('should not be able to emit to other events with self', async () => {
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        emitter.onEvent('caller', null, 'event', (data) => {
          clearTimeout(emitTimeout);
          assert.fail('Event received');
        });
        emitter.emitEvent('caller', null, 'event3', typeToTest.data)
      });
    });
});