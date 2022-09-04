import { expect } from 'chai';
import {randomUUID} from 'crypto';

const randomName = () => randomUUID();

exports.default = (genNewPlugin, maxTimeoutToExpectAResponse) => describe('Emit', async function() {
  this.timeout(maxTimeoutToExpectAResponse + 10);
  this.afterEach(done => setTimeout(done, maxTimeoutToExpectAResponse));
  describe('emitEvent', async () => {
    const emitData = true;
    it('should be able to emit to events with plugin name defined', async () => {
      const thisCaller = randomName();
      const thisPlugin = randomName();
      const thisEvent = randomName();
      const emitter = await genNewPlugin();
      //console.log(emitter)
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, maxTimeoutToExpectAResponse);
      await emitter.onEvent(thisCaller, thisPlugin, thisEvent, (data) => {
        clearTimeout(emitTimeout);
        assert.ok(data);
      });
      await emitter.emitEvent(thisCaller, thisPlugin, thisEvent, emitData)
    });
    it('should be able to emit to events with self', async () => {
      const thisCaller = randomName();
      const thisEvent = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, maxTimeoutToExpectAResponse);
      await emitter.onEvent(thisCaller, null, thisEvent, (data) => {
        clearTimeout(emitTimeout);
        assert.ok(data);
      });
      await emitter.emitEvent(thisCaller, null, thisEvent, emitData)
    });
    it('should not be able to emit to other events with plugin name defined', async () => {
      const thisCaller = randomName();
      const thisPlugin = randomName();
      const thisEvent = randomName();
      const thisEvent2 = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.ok(true);
      }, maxTimeoutToExpectAResponse);
      await emitter.onEvent(thisCaller, thisPlugin, thisEvent, (data) => {
        clearTimeout(emitTimeout);
        assert.fail('Event received');
      });
      await emitter.emitEvent(thisCaller, thisPlugin, thisEvent2, emitData)
    });
    it('should not be able to emit to other events with self', async () => {
      const thisCaller = randomName();
      const thisEvent = randomName();
      const thisEvent2 = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.ok(true);
      }, maxTimeoutToExpectAResponse);
      await emitter.onEvent(thisCaller, null, thisEvent, (data) => {
        clearTimeout(emitTimeout);
        assert.fail('Event received');
      });
      await emitter.emitEvent(thisCaller, null, thisEvent2, emitData)
    });
  });
  describe('onEvent', async () => {
    const emitData = 'ABCD';
    it('should be able to emit to events with plugin name defined', async () => {
      const thisCaller = randomName();
      const thisPlugin = randomName();
      const thisEvent = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, maxTimeoutToExpectAResponse);
      await emitter.onEvent(thisCaller, thisPlugin, thisEvent, (data) => {
        clearTimeout(emitTimeout);
        assert.strictEqual(data, emitData);
      });
      await emitter.emitEvent(thisCaller, thisPlugin, thisEvent, emitData)
    });
    it('should be able to emit to events with self', async () => {
      const thisCaller = randomName();
      const thisPlugin = randomName();
      const thisEvent = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.fail('Event not received');
      }, maxTimeoutToExpectAResponse);
      await emitter.onEvent(thisCaller, null, thisEvent, (data) => {
        clearTimeout(emitTimeout);
        assert.strictEqual(data, emitData);
      });
      await emitter.emitEvent(thisCaller, null, thisEvent, emitData)
    });
    it('should not be able to emit to other events with plugin name defined', async () => {
      const thisCaller = randomName();
      const thisPlugin = randomName();
      const thisEvent = randomName();
      const thisEvent2 = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.ok(true);
      }, maxTimeoutToExpectAResponse);
      await emitter.onEvent(thisCaller, thisPlugin, thisEvent, (data) => {
        clearTimeout(emitTimeout);
        assert.fail('Event received');
      });
      await emitter.emitEvent(thisCaller, thisPlugin, thisEvent2, emitData)
    });
    it('should not be able to emit to other events with self', async () => {
      const thisCaller = randomName();
      const thisEvent = randomName();
      const thisEvent2 = randomName();
      const emitter = await genNewPlugin();
      const emitTimeout = setTimeout(() => {
        assert.ok(true);
      }, maxTimeoutToExpectAResponse);
      await emitter.onEvent(thisCaller, null, thisEvent, (data) => {
        clearTimeout(emitTimeout);
        assert.fail('Event received');
      });
      await emitter.emitEvent(thisCaller, null, thisEvent2, emitData)
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
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail('Event not received');
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(thisCaller, thisPlugin, thisEvent, (data) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(data, typeToTest.data);
        });
        await emitter.emitEvent(thisCaller, thisPlugin, thisEvent, typeToTest.data)
      });
      it('should be able to emit to events with self', async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.fail('Event not received');
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(thisCaller, null, thisEvent, (data) => {
          clearTimeout(emitTimeout);
          assert.strictEqual(data, typeToTest.data);
        });
        await emitter.emitEvent(thisCaller, null, thisEvent, typeToTest.data)
      });
      it('should not be able to emit to other events with plugin name defined', async () => {
        const thisCaller = randomName();
        const thisPlugin = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(thisCaller, thisPlugin, thisEvent, (data) => {
          clearTimeout(emitTimeout);
          assert.fail('Event received');
        });
        await emitter.emitEvent(thisCaller, thisPlugin, thisEvent2, typeToTest.data)
      });
      it('should not be able to emit to other events with self', async () => {
        const thisCaller = randomName();
        const thisEvent = randomName();
        const thisEvent2 = randomName();
        const emitter = await genNewPlugin();
        const emitTimeout = setTimeout(() => {
          assert.ok(true);
        }, maxTimeoutToExpectAResponse);
        await emitter.onEvent(thisCaller, null, thisEvent, (data) => {
          clearTimeout(emitTimeout);
          assert.fail('Event received');
        });
        await emitter.emitEvent(thisCaller, null, thisEvent2, typeToTest.data)
      });
    });
});