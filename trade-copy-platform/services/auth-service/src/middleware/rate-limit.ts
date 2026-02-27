import type { Context, Next } from 'hono';
import type { RateLimiter } from '@tcp/shared-redis';
import { RateLimitError } from '@tcp/shared-utils';

export function rateLimitMiddleware(limiter: RateLimiter, limit = 100, windowMs = 60_000) {
    return async (c: Context, next: Next): Promise<void> => {
        const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
        const path = c.req.path;
        const identifier = `${ip}:${path}`;

        const result = await limiter.check(identifier, limit, windowMs);

        c.header('X-RateLimit-Limit', String(limit));
        c.header('X-RateLimit-Remaining', String(result.remaining));

        if (!result.allowed) {
            throw new RateLimitError('Too many requests, please try again later');
        }

        await next();
    };
}
