const events = require('../lib/events/events').Events;

const logger_Def = require("../lib/logger/logger").Logger;
const testogger = require('./virt-clientLogger').testogger;
const emit = require('./events/emit').default;
const emitAndReturn = require('./events/emitAndReturn').default;
const emitStreamAndReceiveStream = require('./events/emitStreamAndReceiveStream').default;

const fakeLogger = new testogger('test-plugin', process.cwd(),
  new logger_Def('test-plugin', process.cwd(), null, {
    runningInDebug: false
  }), null, {
    error: (e) => assert.fail(new Error(e)),
    fatal: (e) => assert.fail(new Error(e))
  });

describe('Events', () => {
  /*emit(async () => {
    const refP = new events('test-plugin', process.cwd(), fakeLogger, {
      runningInDebug: true
    });
    if (refP.init !== undefined)
      await refP.init();
    return refP;
  }, 10);
  emitAndReturn(async () => {
    const refP = new events('test-plugin', process.cwd(), fakeLogger, {
      runningInDebug: true
    });
    if (refP.init !== undefined)
      await refP.init();
    return refP;
  }, 10);*/
  emitStreamAndReceiveStream(async () => {
    const refP = new events('test-plugin', process.cwd(), fakeLogger, {
      runningInDebug: true
    });
    if (refP.init !== undefined)
      await refP.init();
    refP.eas.staticCommsTimeout = 25;
    return refP;
  }, 50);
});