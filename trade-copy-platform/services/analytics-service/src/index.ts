import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createServiceLogger, errorHandler, loadEnv } from '@tcp/shared-utils';
import { ClickHouseClient } from '@tcp/shared-db';
import { createRedisClient, CacheManager } from '@tcp/shared-redis';
import { createKafkaClient, KafkaConsumer } from '@tcp/shared-kafka';
import { KafkaTopic } from '@tcp/shared-types';

const log = createServiceLogger('analytics-service');
const env = loadEnv();

const clickhouse = new ClickHouseClient();
const redis = createRedisClient();
const cache = new CacheManager(redis, 'analytics:');

// ── Kafka Consumer: Persist Trades to ClickHouse ─────────────

async function startConsumer() {
    const kafka = createKafkaClient('analytics-service');
    const consumer = new KafkaConsumer(kafka, 'analytics-group');
    await consumer.connect();

    await consumer.subscribe(KafkaTopic.ANALYTICS_EVENTS, async (msg) => {
        const trade = msg.payload as any;
        try {
            await clickhouse.insert('trades', [{
                id: trade.tradeId ?? trade.id,
                user_id: trade.userId,
                account_id: trade.accountId,
                broker_type: trade.brokerType,
                symbol: trade.symbol,
                side: trade.side,
                type: trade.type,
                status: trade.status ?? 'FILLED',
                requested_lots: trade.lots ?? 0,
                filled_lots: trade.filledLots ?? trade.lots ?? 0,
                requested_price: trade.price,
                filled_price: trade.filledPrice ?? trade.price,
                stop_loss: trade.stopLoss,
                take_profit: trade.takeProfit,
                commission: trade.commission ?? 0,
                swap: trade.swap ?? 0,
                profit: trade.profit ?? 0,
                pnl: trade.pnl ?? 0,
                source_trade_id: trade.sourceTradeId,
                idempotency_key: trade.idempotencyKey,
                latency_ms: trade.latencyMs ?? 0,
                opened_at: new Date(trade.executedAt ?? trade.timestamp).toISOString(),
                closed_at: trade.closedAt ? new Date(trade.closedAt).toISOString() : null,
            }]);

            // Invalidate relevant caches
            await cache.invalidatePattern(`${trade.userId}:*`);
        } catch (error) {
            log.error({ error, tradeId: trade.tradeId }, 'Failed to insert trade into ClickHouse');
        }
    });

    await consumer.start();
    log.info('Analytics Kafka consumer started');
}

startConsumer().catch((err) => log.error({ error: err }, 'Failed to start analytics consumer'));

// ── API ──────────────────────────────────────────────────────

const app = new Hono();
app.onError((err, c) => errorHandler(err, c));
app.get('/health', (c) => c.json({ status: 'ok', service: 'analytics-service' }));

// ── Daily PnL ────────────────────────────────────────────────

app.get('/analytics/pnl/daily', async (c) => {
    const userId = c.req.header('x-user-id') ?? '';
    const days = parseInt(c.req.query('days') ?? '30', 10);

    const data = await cache.getOrSet(`${userId}:pnl:daily:${days}`, async () => {
        return clickhouse.query(`
      SELECT trade_date, total_pnl, trade_count, win_count, loss_count,
             total_wins, total_losses, total_volume, avg_latency_ms
      FROM daily_pnl_mv
      WHERE user_id = '${userId}'
        AND trade_date >= today() - ${days}
      ORDER BY trade_date DESC
    `);
    }, 60);

    return c.json({ success: true, data });
});

// ── Monthly PnL ──────────────────────────────────────────────

app.get('/analytics/pnl/monthly', async (c) => {
    const userId = c.req.header('x-user-id') ?? '';

    const data = await cache.getOrSet(`${userId}:pnl:monthly`, async () => {
        return clickhouse.query(`
      SELECT toStartOfMonth(trade_date) AS month,
             sum(total_pnl) AS total_pnl, sum(trade_count) AS trade_count,
             sum(win_count) AS wins, sum(loss_count) AS losses
      FROM daily_pnl_mv
      WHERE user_id = '${userId}'
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `);
    }, 300);

    return c.json({ success: true, data });
});

// ── Dashboard Overview ───────────────────────────────────────

app.get('/analytics/overview', async (c) => {
    const userId = c.req.header('x-user-id') ?? '';

    const data = await cache.getOrSet(`${userId}:overview`, async () => {
        const [daily, monthly, latency] = await Promise.all([
            clickhouse.query(`
        SELECT sum(total_pnl) AS pnl FROM daily_pnl_mv
        WHERE user_id='${userId}' AND trade_date = today()
      `),
            clickhouse.query(`
        SELECT sum(total_pnl) AS pnl FROM daily_pnl_mv
        WHERE user_id='${userId}' AND trade_date >= toStartOfMonth(today())
      `),
            clickhouse.query(`
        SELECT avg(latency_ms) AS avg_latency FROM trades
        WHERE user_id='${userId}' AND opened_at >= now() - INTERVAL 1 DAY
      `),
        ]);

        return {
            dailyPnl: (daily[0] as any)?.pnl ?? 0,
            monthlyPnl: (monthly[0] as any)?.pnl ?? 0,
            avgLatencyMs: (latency[0] as any)?.avg_latency ?? 0,
        };
    }, 30);

    return c.json({ success: true, data });
});

// ── Symbol Performance ───────────────────────────────────────

app.get('/analytics/symbols', async (c) => {
    const userId = c.req.header('x-user-id') ?? '';

    const data = await cache.getOrSet(`${userId}:symbols`, async () => {
        return clickhouse.query(`
      SELECT symbol, trade_count, total_pnl, wins, losses, total_volume
      FROM symbol_performance_mv
      WHERE user_id='${userId}'
      ORDER BY total_pnl DESC
    `);
    }, 120);

    return c.json({ success: true, data });
});

// ── Trade History ────────────────────────────────────────────

app.get('/analytics/trades', async (c) => {
    const userId = c.req.header('x-user-id') ?? '';
    const limit = parseInt(c.req.query('limit') ?? '100', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    const data = await clickhouse.query(`
    SELECT * FROM trades
    WHERE user_id='${userId}'
    ORDER BY opened_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

    return c.json({ success: true, data });
});

// ── CSV Export ────────────────────────────────────────────────

app.get('/analytics/export/csv', async (c) => {
    const userId = c.req.header('x-user-id') ?? '';
    const from = c.req.query('from') ?? '';
    const to = c.req.query('to') ?? '';

    let dateFilter = '';
    if (from && to) dateFilter = `AND opened_at >= '${from}' AND opened_at <= '${to}'`;

    const trades = await clickhouse.query(`
    SELECT id, symbol, side, type, status, filled_lots, filled_price,
           commission, swap, pnl, opened_at, closed_at
    FROM trades
    WHERE user_id='${userId}' ${dateFilter}
    ORDER BY opened_at DESC
    LIMIT 10000
  `) as any[];

    const header = 'id,symbol,side,type,status,lots,price,commission,swap,pnl,opened_at,closed_at\n';
    const rows = trades.map((t: any) =>
        `${t.id},${t.symbol},${t.side},${t.type},${t.status},${t.filled_lots},${t.filled_price},${t.commission},${t.swap},${t.pnl},${t.opened_at},${t.closed_at ?? ''}`
    ).join('\n');

    return new Response(header + rows, {
        headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="trades_${userId}_${Date.now()}.csv"`,
        },
    });
});

const port = env.PORT || 3006;
serve({ fetch: app.fetch, port: Number(port) }, (info) => {
    log.info({ port: info.port }, 'Analytics service running');
});
