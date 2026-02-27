import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createServiceLogger, errorHandler, loadEnv, ValidationError } from '@tcp/shared-utils';
import { PostgresClient } from '@tcp/shared-db';
import { createRedisClient } from '@tcp/shared-redis';
import { createKafkaClient, KafkaProducer } from '@tcp/shared-kafka';
import { RiskService } from './domain/risk-service.js';
import type { RiskValidationRequest } from '@tcp/shared-types';

const log = createServiceLogger('risk-engine');
const env = loadEnv();

const db = new PostgresClient();
const redis = createRedisClient();
const kafka = createKafkaClient('risk-engine');
const producer = new KafkaProducer(kafka, 'risk-engine');

const riskService = new RiskService(db, redis, producer);

const app = new Hono();
app.onError((err, c) => errorHandler(err, c));
app.get('/health', (c) => c.json({ status: 'ok', service: 'risk-engine' }));

// ── Validate Trade ───────────────────────────────────────────

app.post('/risk/validate', async (c) => {
    const body = await c.req.json() as RiskValidationRequest;
    if (!body.userId || !body.accountId) throw new ValidationError('userId and accountId required');
    const result = await riskService.validateTrade(body);
    return c.json({ success: true, data: result });
});

// ── Kill Switch ──────────────────────────────────────────────

app.post('/risk/kill-switch', async (c) => {
    const { accountId, activate } = await c.req.json();
    if (!accountId) throw new ValidationError('accountId required');
    await riskService.setKillSwitch(accountId, activate);
    return c.json({ success: true });
});

app.get('/risk/kill-switch/:accountId', async (c) => {
    const active = await riskService.isKillSwitchActive(c.req.param('accountId'));
    return c.json({ success: true, data: { active } });
});

// ── Risk State ───────────────────────────────────────────────

app.get('/risk/state/:accountId', async (c) => {
    const state = await riskService.getRiskState(c.req.param('accountId'));
    return c.json({ success: true, data: state });
});

// ── Global Kill Switch ───────────────────────────────────────

app.post('/risk/global-kill-switch', async (c) => {
    const { activate } = await c.req.json();
    await riskService.setGlobalKillSwitch(activate);
    return c.json({ success: true });
});

const port = env.PORT || 3004;
serve({ fetch: app.fetch, port: Number(port) }, (info) => {
    log.info({ port: info.port }, 'Risk engine running');
});
