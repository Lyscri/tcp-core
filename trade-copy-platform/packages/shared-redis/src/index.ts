import Redis from 'ioredis';
import { createServiceLogger, retry } from '@tcp/shared-utils';

const log = createServiceLogger('redis');

// ──────────────────────────────────────────────────────────────
// Redis Client Factory
// ──────────────────────────────────────────────────────────────

export function createRedisClient(url?: string): Redis {
    const redisUrl = url ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    const client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
            const delay = Math.min(times * 200, 5000);
            log.warn({ attempt: times, delayMs: delay }, 'Redis reconnecting');
            return delay;
        },
        enableReadyCheck: true,
        lazyConnect: false,
    });

    client.on('connect', () => log.info('Redis connected'));
    client.on('error', (err) => log.error({ error: err }, 'Redis error'));
    client.on('close', () => log.warn('Redis connection closed'));

    return client;
}

// ──────────────────────────────────────────────────────────────
// Distributed Lock (Simplified Redlock)
// ──────────────────────────────────────────────────────────────

export class DistributedLock {
    private client: Redis;
    private readonly prefix = 'lock:';

    constructor(client: Redis) {
        this.client = client;
    }

    /**
     * Acquire a distributed lock using SET NX EX pattern.
     * Returns the lock value (for release) or null if already locked.
     */
    async acquire(resource: string, ttlMs: number): Promise<string | null> {
        const lockValue = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const key = `${this.prefix}${resource}`;
        const result = await this.client.set(key, lockValue, 'PX', ttlMs, 'NX');
        if (result === 'OK') {
            log.debug({ resource, ttlMs }, 'Lock acquired');
            return lockValue;
        }
        return null;
    }

    /**
     * Release a lock only if we still own it (CAS via Lua script).
     */
    async release(resource: string, lockValue: string): Promise<boolean> {
        const key = `${this.prefix}${resource}`;
        const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
        const result = await this.client.eval(script, 1, key, lockValue);
        const released = result === 1;
        if (released) log.debug({ resource }, 'Lock released');
        return released;
    }

    /**
     * Execute a function while holding a lock. Auto-releases on completion.
     */
    async withLock<T>(
        resource: string,
        ttlMs: number,
        fn: () => Promise<T>,
        acquireTimeoutMs = 5000
    ): Promise<T> {
        const deadline = Date.now() + acquireTimeoutMs;

        while (Date.now() < deadline) {
            const lockValue = await this.acquire(resource, ttlMs);
            if (lockValue) {
                try {
                    return await fn();
                } finally {
                    await this.release(resource, lockValue);
                }
            }
            await new Promise((r) => setTimeout(r, 50 + Math.random() * 50));
        }

        throw new Error(`Failed to acquire lock for ${resource} within ${acquireTimeoutMs}ms`);
    }
}

// ──────────────────────────────────────────────────────────────
// Cache Helper
// ──────────────────────────────────────────────────────────────

export class CacheManager {
    private client: Redis;
    private readonly prefix: string;

    constructor(client: Redis, prefix = 'cache:') {
        this.client = client;
        this.prefix = prefix;
    }

    async get<T>(key: string): Promise<T | null> {
        const data = await this.client.get(`${this.prefix}${key}`);
        if (!data) return null;
        return JSON.parse(data) as T;
    }

    async set<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
        await this.client.setex(`${this.prefix}${key}`, ttlSeconds, JSON.stringify(value));
    }

    async del(key: string): Promise<void> {
        await this.client.del(`${this.prefix}${key}`);
    }

    async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds = 300): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) return cached;
        const value = await factory();
        await this.set(key, value, ttlSeconds);
        return value;
    }

    async invalidatePattern(pattern: string): Promise<void> {
        const keys = await this.client.keys(`${this.prefix}${pattern}`);
        if (keys.length > 0) {
            await this.client.del(...keys);
        }
    }
}

// ──────────────────────────────────────────────────────────────
// Rate Limiter (Sliding Window)
// ──────────────────────────────────────────────────────────────

export class RateLimiter {
    private client: Redis;
    private readonly prefix = 'rl:';

    constructor(client: Redis) {
        this.client = client;
    }

    /**
     * Check if an action is within rate limits using sliding window counter.
     * Returns { allowed, remaining, resetMs }.
     */
    async check(
        identifier: string,
        limit: number,
        windowMs: number
    ): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
        const key = `${this.prefix}${identifier}`;
        const now = Date.now();
        const windowStart = now - windowMs;

        const pipeline = this.client.pipeline();
        pipeline.zremrangebyscore(key, 0, windowStart);
        pipeline.zadd(key, now.toString(), `${now}_${Math.random()}`);
        pipeline.zcard(key);
        pipeline.pexpire(key, windowMs);
        const results = await pipeline.exec();

        const count = (results?.[2]?.[1] as number) ?? 0;
        const allowed = count <= limit;
        const remaining = Math.max(0, limit - count);
        const resetMs = windowMs;

        if (!allowed) {
            // Remove the entry we just added since we're rejecting
            await this.client.zremrangebyscore(key, now, now);
        }

        return { allowed, remaining, resetMs };
    }
}

export { Redis };
export type { Redis as RedisClient } from 'ioredis';
