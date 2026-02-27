import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createServiceLogger, errorHandler, loadEnv, generateCorrelationId } from '@tcp/shared-utils';
import { createRedisClient, RateLimiter } from '@tcp/shared-redis';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { authMiddleware } from './middleware/auth.js';
import { proxyRequest } from './proxy.js';

const log = createServiceLogger('api-gateway');
const env = loadEnv();
const redis = createRedisClient();
const rateLimiter = new RateLimiter(redis);

const app = new Hono();

// ── Global Middleware ────────────────────────────────────────

app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
}));

// Correlation ID
app.use('*', async (c, next) => {
    const correlationId = c.req.header('x-request-id') ?? generateCorrelationId();
    c.header('X-Request-Id', correlationId);
    c.set('correlationId' as never, correlationId as never);
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    log.info({ method: c.req.method, path: c.req.path, status: c.res.status, duration, correlationId }, 'Request handled');
});

app.use('/api/*', rateLimitMiddleware(rateLimiter, 200, 60_000));

app.onError((err, c) => errorHandler(err, c));

// ── Health ───────────────────────────────────────────────────

app.get('/health', (c) => c.json({ status: 'ok', service: 'api-gateway' }));

app.get('/api/health', async (c) => {
    const services = ['auth-service', 'account-service', 'trade-sync-engine', 'risk-engine', 'analytics-service', 'payment-service', 'admin-service'];
    const checks = await Promise.allSettled(
        services.map(async (s) => {
            const url = getServiceUrl(s);
            const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
            return { service: s, status: res.ok ? 'healthy' : 'unhealthy' };
        })
    );
    const results = checks.map((r, i) => r.status === 'fulfilled' ? r.value : { service: services[i]!, status: 'unreachable' });
    return c.json({ success: true, data: results });
});

// ── Auth Routes (no auth required) ───────────────────────────

app.all('/api/auth/*', async (c) => {
    const url = env.AUTH_SERVICE_URL ?? 'http://localhost:3001';
    const path = c.req.path.replace('/api/auth', '/auth');
    return proxyRequest(c, url, path);
});

// ── Protected Routes ─────────────────────────────────────────

app.use('/api/accounts/*', authMiddleware);
app.use('/api/analytics/*', authMiddleware);
app.use('/api/payments/*', authMiddleware);
app.use('/api/admin/*', authMiddleware);

app.all('/api/accounts/*', async (c) => {
    const url = env.ACCOUNT_SERVICE_URL ?? 'http://localhost:3002';
    const path = c.req.path.replace('/api/accounts', '/accounts');
    return proxyRequest(c, url, path, c.get('userId' as never));
});

app.all('/api/analytics/*', async (c) => {
    const url = env.ANALYTICS_SERVICE_URL ?? 'http://localhost:3006';
    const path = c.req.path.replace('/api/analytics', '/analytics');
    return proxyRequest(c, url, path, c.get('userId' as never));
});

app.all('/api/payments/*', async (c) => {
    const url = env.PAYMENT_SERVICE_URL ?? 'http://localhost:3007';
    const path = c.req.path.replace('/api/payments', '/payments');
    return proxyRequest(c, url, path, c.get('userId' as never));
});

app.all('/api/admin/*', async (c) => {
    const url = env.ADMIN_SERVICE_URL ?? 'http://localhost:3008';
    const path = c.req.path.replace('/api/admin', '/admin');
    return proxyRequest(c, url, path, c.get('userId' as never), c.get('userRole' as never));
});

app.all('/api/risk/*', async (c) => {
    const url = env.RISK_ENGINE_URL ?? 'http://localhost:3004';
    const path = c.req.path.replace('/api/risk', '/risk');
    return proxyRequest(c, url, path, c.get('userId' as never));
});

// ── Service URL Resolver ─────────────────────────────────────

function getServiceUrl(service: string): string {
    const urls: Record<string, string> = {
        'auth-service': env.AUTH_SERVICE_URL ?? 'http://localhost:3001',
        'account-service': env.ACCOUNT_SERVICE_URL ?? 'http://localhost:3002',
        'trade-sync-engine': env.TRADE_SYNC_URL ?? 'http://localhost:3003',
        'risk-engine': env.RISK_ENGINE_URL ?? 'http://localhost:3004',
        'analytics-service': env.ANALYTICS_SERVICE_URL ?? 'http://localhost:3006',
        'payment-service': env.PAYMENT_SERVICE_URL ?? 'http://localhost:3007',
        'admin-service': env.ADMIN_SERVICE_URL ?? 'http://localhost:3008',
    };
    return urls[service] ?? `http://localhost:3000`;
}

// ── Start ────────────────────────────────────────────────────

const port = env.PORT || 3000;
serve({ fetch: app.fetch, port: Number(port) }, (info) => {
    log.info({ port: info.port }, 'API Gateway running');
});

export default app;
