import { createServiceLogger } from './logger.js';

const log = createServiceLogger('retry');

export interface RetryOptions {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    retryableErrors?: string[];
    onRetry?: (error: Error, attempt: number) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 10_000,
    backoffMultiplier: 2,
};

export async function retry<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {}
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (
                opts.retryableErrors &&
                !opts.retryableErrors.some((code) => lastError!.message.includes(code))
            ) {
                throw lastError;
            }

            if (attempt === opts.maxAttempts) {
                log.error({ error: lastError, attempt }, 'All retry attempts exhausted');
                throw lastError;
            }

            const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15
            const delay = Math.min(
                opts.baseDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1) * jitter,
                opts.maxDelayMs
            );

            log.warn({ attempt, nextRetryMs: delay, error: lastError.message }, 'Retrying operation');
            opts.onRetry?.(lastError, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw lastError ?? new Error('Retry failed with unknown error');
}
