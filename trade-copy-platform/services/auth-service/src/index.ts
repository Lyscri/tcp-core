import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createServiceLogger, errorHandler, loadEnv } from '@tcp/shared-utils';
import { createRedisClient, RateLimiter } from '@tcp/shared-redis';
import { PostgresClient } from '@tcp/shared-db';
import { AuthService } from './domain/auth-service.js';
import { UserRepository } from './infrastructure/user-repository.js';
import { TokenRepository } from './infrastructure/token-repository.js';
import { createAuthRoutes } from './routes/auth-routes.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';

const log = createServiceLogger('auth-service');
const env = loadEnv();

// ── Dependency Injection ─────────────────────────────────────

const db = new PostgresClient();
const redis = createRedisClient();
const rateLimiter = new RateLimiter(redis);
const userRepo = new UserRepository(db);
const tokenRepo = new TokenRepository(db);
const authService = new AuthService(userRepo, tokenRepo, redis);

// ── App ──────────────────────────────────────────────────────

const app = new Hono();

app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization'] }));
app.use('*', rateLimitMiddleware(rateLimiter));

app.onError((err, c) => errorHandler(err, c));

app.get('/health', (c) => c.json({ status: 'ok', service: 'auth-service' }));

app.route('/auth', createAuthRoutes(authService));

// ── Start ────────────────────────────────────────────────────

const port = env.PORT || 3001;
log.info({ port }, 'Auth service starting');
serve({ fetch: app.fetch, port: Number(port) }, (info) => {
    log.info({ port: info.port }, 'Auth service running');
});

export default app;
