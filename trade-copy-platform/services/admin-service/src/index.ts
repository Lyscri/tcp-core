import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createServiceLogger, errorHandler, loadEnv, ValidationError, AuthorizationError } from '@tcp/shared-utils';
import { PostgresClient, ClickHouseClient } from '@tcp/shared-db';
import { createRedisClient } from '@tcp/shared-redis';

const log = createServiceLogger('admin-service');
const env = loadEnv();

const db = new PostgresClient();
const clickhouse = new ClickHouseClient();
const redis = createRedisClient();

const app = new Hono();
app.onError((err, c) => errorHandler(err, c));
app.get('/health', (c) => c.json({ status: 'ok', service: 'admin-service' }));

// ── Admin Auth Check ─────────────────────────────────────────

function requireAdmin(c: any) {
    const role = c.req.header('x-user-role');
    if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
        throw new AuthorizationError('Admin access required');
    }
}

// ── Users Management ─────────────────────────────────────────

app.get('/admin/users', async (c) => {
    requireAdmin(c);
    const page = parseInt(c.req.query('page') ?? '1', 10);
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const offset = (page - 1) * limit;

    const countResult = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM users');
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const result = await db.query(
        'SELECT id, email, name, role, email_verified, suspended, created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
    );

    return c.json({ success: true, data: result.rows, meta: { page, limit, total } });
});

app.get('/admin/users/:id', async (c) => {
    requireAdmin(c);
    const result = await db.query(
        'SELECT id, email, name, role, email_verified, two_factor_enabled, suspended, created_at, updated_at FROM users WHERE id = $1',
        [c.req.param('id')]
    );
    if (result.rows.length === 0) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
    return c.json({ success: true, data: result.rows[0] });
});

app.put('/admin/users/:id/suspend', async (c) => {
    requireAdmin(c);
    const { suspended } = await c.req.json();
    await db.query('UPDATE users SET suspended = $1 WHERE id = $2', [suspended, c.req.param('id')]);
    log.info({ userId: c.req.param('id'), suspended }, 'User suspension toggled');
    return c.json({ success: true });
});

app.put('/admin/users/:id/role', async (c) => {
    requireAdmin(c);
    const { role } = await c.req.json();
    if (!['USER', 'ADMIN', 'SUPERADMIN'].includes(role)) throw new ValidationError('Invalid role');
    await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, c.req.param('id')]);
    return c.json({ success: true });
});

// ── System Logs ──────────────────────────────────────────────

app.get('/admin/logs', async (c) => {
    requireAdmin(c);
    const limit = parseInt(c.req.query('limit') ?? '50', 10);
    const service = c.req.query('service');
    const level = c.req.query('level');

    let query = 'SELECT * FROM system_logs WHERE 1=1';
    const params: unknown[] = [];
    let i = 1;

    if (service) { query += ` AND service = $${i++}`; params.push(service); }
    if (level) { query += ` AND level = $${i++}`; params.push(level); }
    query += ` ORDER BY created_at DESC LIMIT $${i}`;
    params.push(limit);

    const result = await db.query(query, params);
    return c.json({ success: true, data: result.rows });
});

// ── Trading Volume (from ClickHouse) ─────────────────────────

app.get('/admin/volume', async (c) => {
    requireAdmin(c);
    const days = parseInt(c.req.query('days') ?? '30', 10);

    const data = await clickhouse.query(`
    SELECT toDate(opened_at) AS date,
           count() AS trade_count,
           sum(filled_lots) AS total_volume,
           sum(pnl) AS total_pnl,
           count(DISTINCT user_id) AS active_users
    FROM trades
    WHERE opened_at >= today() - ${days}
    GROUP BY date
    ORDER BY date DESC
  `);

    return c.json({ success: true, data });
});

// ── Top Traders ──────────────────────────────────────────────

app.get('/admin/top-traders', async (c) => {
    requireAdmin(c);
    const limit = parseInt(c.req.query('limit') ?? '10', 10);

    const data = await clickhouse.query(`
    SELECT user_id,
           count() AS trade_count,
           sum(pnl) AS total_pnl,
           countIf(pnl > 0) AS wins,
           countIf(pnl <= 0) AS losses,
           if(count() > 0, countIf(pnl > 0) / count() * 100, 0) AS win_rate,
           sum(filled_lots) AS total_volume
    FROM trades
    WHERE status = 'FILLED' AND opened_at >= today() - 30
    GROUP BY user_id
    ORDER BY total_pnl DESC
    LIMIT ${limit}
  `);

    return c.json({ success: true, data });
});

// ── System Control ───────────────────────────────────────────

app.get('/admin/system/status', async (c) => {
    requireAdmin(c);
    const globalKill = await redis.get('risk:global:kill');
    const processed = await redis.get('sync:stats:processed');
    const failed = await redis.get('sync:stats:failed');

    return c.json({
        success: true,
        data: {
            globalKillSwitch: globalKill === '1',
            tradesProcessed: parseInt(processed ?? '0', 10),
            tradesFailed: parseInt(failed ?? '0', 10),
        },
    });
});

app.post('/admin/system/global-kill-switch', async (c) => {
    requireAdmin(c);
    const { activate } = await c.req.json();
    if (activate) {
        await redis.set('risk:global:kill', '1');
    } else {
        await redis.del('risk:global:kill');
    }
    log.warn({ activate }, 'Global kill switch toggled by admin');
    return c.json({ success: true });
});

const port = env.PORT || 3008;
serve({ fetch: app.fetch, port: Number(port) }, (info) => {
    log.info({ port: info.port }, 'Admin service running');
});
