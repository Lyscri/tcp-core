import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createServiceLogger, errorHandler, loadEnv, ValidationError } from '@tcp/shared-utils';
import { createKafkaClient, KafkaProducer } from '@tcp/shared-kafka';
import { createRedisClient, RateLimiter } from '@tcp/shared-redis';
import { KafkaTopic, BrokerType } from '@tcp/shared-types';
import type { TradeEventDTO } from '@tcp/shared-types';
import { AdapterRegistry } from './adapters/adapter-registry.js';

const log = createServiceLogger('broker-adapters');
const env = loadEnv();

const redis = createRedisClient();
const kafka = createKafkaClient('broker-adapters');
const producer = new KafkaProducer(kafka, 'broker-adapters');
const rateLimiter = new RateLimiter(redis);
const registry = new AdapterRegistry();

const app = new Hono();
app.onError((err, c) => errorHandler(err, c));
app.get('/health', (c) => c.json({ status: 'ok', service: 'broker-adapters' }));

// ── Execute Trade ────────────────────────────────────────────

app.post('/broker/execute', async (c) => {
    const trade = await c.req.json() as TradeEventDTO;
    if (!trade.accountId || !trade.symbol) throw new ValidationError('Invalid trade event');

    // Throttle: max 50 trades per second per account
    const rl = await rateLimiter.check(`broker:${trade.accountId}`, 50, 1000);
    if (!rl.allowed) {
        return c.json({ success: false, error: { code: 'RATE_LIMIT', message: 'Broker rate limit exceeded' } }, 429);
    }

    const adapter = registry.getOrCreate(trade.brokerType as BrokerType, trade.accountId);
    if (!adapter.isConnected()) {
        await adapter.connect({});
    }

    const result = await adapter.executeTrade(trade);

    // Publish trade event to analytics
    await producer.connect();
    await producer.publish(KafkaTopic.ANALYTICS_EVENTS, trade.tradeId, {
        ...trade,
        ...result,
        executedAt: Date.now(),
    });

    return c.json({ success: true, data: result });
});

// ── Get Positions ────────────────────────────────────────────

app.get('/broker/positions/:accountId', async (c) => {
    const accountId = c.req.param('accountId');
    const brokerType = (c.req.query('brokerType') ?? 'SIMULATED') as BrokerType;
    const adapter = registry.getOrCreate(brokerType, accountId);
    if (!adapter.isConnected()) await adapter.connect({});
    const positions = await adapter.getPositions(accountId);
    return c.json({ success: true, data: positions });
});

// ── Get Account Info ─────────────────────────────────────────

app.get('/broker/account-info/:accountId', async (c) => {
    const accountId = c.req.param('accountId');
    const brokerType = (c.req.query('brokerType') ?? 'SIMULATED') as BrokerType;
    const adapter = registry.getOrCreate(brokerType, accountId);
    if (!adapter.isConnected()) await adapter.connect({});
    const info = await adapter.getAccountInfo(accountId);
    return c.json({ success: true, data: info });
});

// ── Simulate Leader Trade (for testing) ──────────────────────

app.post('/broker/simulate-leader-trade', async (c) => {
    const trade = await c.req.json() as TradeEventDTO;
    await producer.connect();
    await producer.publish(KafkaTopic.BROKER_TRADE_EVENTS, trade.accountId, trade);
    return c.json({ success: true, message: 'Leader trade event published' });
});

const port = env.PORT || 3005;
serve({ fetch: app.fetch, port: Number(port) }, (info) => {
    log.info({ port: info.port }, 'Broker adapters running');
});
