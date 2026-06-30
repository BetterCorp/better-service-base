const RETRYABLE_NETWORK_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export type RegistryPublishRetryOptions = {
  maxAttempts?: number;
  delayMs?: number;
  onRetry?: (attempt: number, maxAttempts: number, error: Error, delayMs: number) => void;
};

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nestedErrors(error: unknown): unknown[] {
  if (!error || typeof error !== 'object') return [];
  const cause = (error as { cause?: unknown }).cause;
  const aggregate = (error as { errors?: unknown }).errors;
  const errors = Array.isArray(aggregate) ? aggregate : [];
  return cause ? [cause, ...errors] : errors;
}

export function isRetryablePublishError(error: unknown): boolean {
  const code = errorCode(error);
  if (code && RETRYABLE_NETWORK_CODES.has(code)) {
    return true;
  }

  const message = errorMessage(error);
  if (/\b(connect\s+)?(ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH)\b/i.test(message)) {
    return true;
  }

  return nestedErrors(error).some(isRetryablePublishError);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryRegistryPublish<T>(
  operation: () => Promise<T>,
  options: RegistryPublishRetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 10;
  const delayMs = options.delayMs ?? 10_000;
  let attempt = 1;

  while (true) {
    try {
      return await operation();
    } catch (err) {
      const error = toError(err);
      if (attempt >= maxAttempts || !isRetryablePublishError(error)) {
        throw error;
      }

      options.onRetry?.(attempt + 1, maxAttempts, error, delayMs);
      await delay(delayMs);
      attempt++;
    }
  }
}
