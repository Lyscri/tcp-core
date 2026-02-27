import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createServiceLogger, errorHandler, loadEnv } from '@tcp/shared-utils';
import { createRedisClient, DistributedLock, CacheManager } from '@tcp/shared-redis';
import { createKafkaClient, KafkaConsumer, KafkaProducer } from '@tcp/shared-kafka';
import { KafkaTopic } from '@tcp/shared-types';
import { TradeSyncService } from './domain/trade-sync-service.js';

const log = createServiceLogger('trade-sync-engine');
const env = loadEnv();

// ── Dependencies ─────────────────────────────────────────────

const redis = createRedisClient();
const lock = new DistributedLock(redis);
const kafka = createKafkaClient('trade-sync-engine');
const consumer = new KafkaConsumer(kafka, 'trade-sync-group');
const producer = new KafkaProducer(kafka, 'trade-sync-engine');

const accountServiceUrl = env.ACCOUNT_SERVICE_URL ?? 'http://localhost:3002';
const riskEngineUrl = env.RISK_ENGINE_URL ?? 'http://localhost:3004';
const brokerAdapterUrl = env.BROKER_ADAPTER_URL ?? 'http://localhost:3005';

const syncService = new TradeSyncService(redis, lock, producer, accountServiceUrl, riskEngineUrl, brokerAdapterUrl);

// ── Kafka Consumer Setup ─────────────────────────────────────

async function startConsumer() {
    await consumer.connect();
    await producer.connect();

    await consumer.subscribe(KafkaTopic.BROKER_TRADE_EVENTS, async (message) => {
        log.info({ tradeId: message.payload, correlationId: message.correlationId }, 'Received trade event');
        await syncService.processTradeEvent(message);
    });

    await consumer.start();
    log.info('Trade sync consumer started');
}

startConsumer().catch((err) => {
    log.error({ error: err }, 'Failed to start consumer');
});

// ── Health API ───────────────────────────────────────────────

const app = new Hono();
app.onError((err, c) => errorHandler(err, c));
app.get('/health', (c) => c.json({ status: 'ok', service: 'trade-sync-engine' }));

app.get('/stats', async (c) => {
    const processed = await redis.get('sync:stats:processed') ?? '0';
    const failed = await redis.get('sync:stats:failed') ?? '0';
    return c.json({ success: true, data: { processed: parseInt(processed), failed: parseInt(failed) } });
});

const port = env.PORT || 3003;
serve({ fetch: app.fetch, port: Number(port) }, (info) => {
    log.info({ port: info.port }, 'Trade sync engine running');
});
