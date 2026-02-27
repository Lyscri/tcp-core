import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createServiceLogger, errorHandler, loadEnv } from '@tcp/shared-utils';
import { PostgresClient } from '@tcp/shared-db';
import { createRedisClient, CacheManager } from '@tcp/shared-redis';
import { createKafkaClient, KafkaProducer } from '@tcp/shared-kafka';
import { AccountRepository } from './infrastructure/account-repository.js';
import { SyncConfigRepository } from './infrastructure/sync-config-repository.js';
import { RiskConfigRepository } from './infrastructure/risk-config-repository.js';
import { AccountService } from './domain/account-service.js';
import { createAccountRoutes } from './routes/account-routes.js';

const log = createServiceLogger('account-service');
const env = loadEnv();

const db = new PostgresClient();
const redis = createRedisClient();
const cache = new CacheManager(redis, 'acct:');
const kafka = createKafkaClient('account-service');
const producer = new KafkaProducer(kafka, 'account-service');

const accountRepo = new AccountRepository(db);
const syncConfigRepo = new SyncConfigRepository(db);
const riskConfigRepo = new RiskConfigRepository(db);
const accountService = new AccountService(accountRepo, syncConfigRepo, riskConfigRepo, cache, producer);

const app = new Hono();
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization'] }));
app.onError((err, c) => errorHandler(err, c));
app.get('/health', (c) => c.json({ status: 'ok', service: 'account-service' }));
app.route('/accounts', createAccountRoutes(accountService));

const port = env.PORT || 3002;
serve({ fetch: app.fetch, port: Number(port) }, (info) => {
    log.info({ port: info.port }, 'Account service running');
});

export default app;
