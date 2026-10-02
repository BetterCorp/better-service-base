import assert from 'node:assert/strict';
import test from 'node:test';
import { redactAmqpEndpoint } from '../src/plugins/events-rabbitmq/index.js';

test('AMQP endpoint diagnostics omit credentials, query parameters, and fragments', () => {
  const input = 'amqps://canary-user:canary-password@rabbit.example/vhost?token=canary-query#canary-fragment';
  const logged = redactAmqpEndpoint(input);
  assert.equal(logged, 'amqps://rabbit.example/vhost');
  for (const secret of ['canary-user', 'canary-password', 'canary-query', 'canary-fragment']) {
    assert.equal(logged.includes(secret), false);
  }
  assert.equal(redactAmqpEndpoint('not a URL with canary-password'), '[invalid AMQP endpoint]');
});
