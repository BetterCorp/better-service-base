import * as assert from 'node:assert';
import { STORED_OBSERVABLE_PATTERN } from '../../scripts/source-validation.js';

describe('source validation', () => {
  it('rejects stored Observables without rejecting derived handles', () => {
    assert.match('this.obs = obs;', STORED_OBSERVABLE_PATTERN);
    assert.match('this.lifecycleContext=obs // later', STORED_OBSERVABLE_PATTERN);
    assert.doesNotMatch('this.counter = obs.metrics.counter("requests")', STORED_OBSERVABLE_PATTERN);
    assert.doesNotMatch('const child = obs.startSpan("work")', STORED_OBSERVABLE_PATTERN);
  });
});