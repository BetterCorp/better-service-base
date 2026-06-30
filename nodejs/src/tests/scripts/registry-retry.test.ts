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

  it('defaults to ten attempts and reports retry delay', async () => {
    let attempts = 0;
    const retries: Array<{ attempt: number; maxAttempts: number; delayMs: number }> = [];

    await assert.rejects(
      retryRegistryPublish(
        async () => {
          attempts++;
          const err = new Error('connect ETIMEDOUT 65.21.87.190:443') as Error & { code: string };
          err.code = 'ETIMEDOUT';
          throw err;
        },
        {
          delayMs: 0,
          onRetry: (attempt, maxAttempts, _err, delayMs) => {
            retries.push({ attempt, maxAttempts, delayMs });
          },
        }
      ),
      /ETIMEDOUT/
    );

    assert.strictEqual(attempts, 10);
    assert.strictEqual(retries.length, 9);
    assert.deepStrictEqual(retries[0], { attempt: 2, maxAttempts: 10, delayMs: 0 });
    assert.deepStrictEqual(retries[8], { attempt: 10, maxAttempts: 10, delayMs: 0 });
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
