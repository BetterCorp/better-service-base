import * as assert from 'assert';
import {
  isRetryablePublishError,
  retryRegistryPublish,
} from '../../scripts/registry-retry.js';

describe('registry publish retry', () => {
  it('retries network and DNS failures up to the max attempts', async () => {
    let attempts = 0;

    const result = await retryRegistryPublish(
      async () => {
        attempts++;
        if (attempts < 3) {
          const err = new Error('connect ETIMEDOUT 65.21.87.190:443') as Error & { code: string };
          err.code = 'ETIMEDOUT';
          throw err;
        }
        return 'published';
      },
      { delayMs: 0, maxAttempts: 3 }
    );

    assert.strictEqual(result, 'published');
    assert.strictEqual(attempts, 3);
  });

  it('does not retry validation or HTTP errors', async () => {
    let attempts = 0;

    await assert.rejects(
      retryRegistryPublish(
        async () => {
          attempts++;
          throw new Error('Package name is required');
        },
        { delayMs: 0, maxAttempts: 3 }
      ),
      /Package name is required/
    );

    assert.strictEqual(attempts, 1);
  });

  it('recognizes nested network errors', () => {
    const cause = new Error('getaddrinfo EAI_AGAIN io.bsbcode.dev') as Error & { code: string };
    cause.code = 'EAI_AGAIN';
    assert.strictEqual(isRetryablePublishError(new Error('registry request failed', { cause })), true);
  });
});
