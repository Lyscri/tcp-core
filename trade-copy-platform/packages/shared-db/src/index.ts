import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { createServiceLogger } from '@tcp/shared-utils';

const log = createServiceLogger('postgres');

// ──────────────────────────────────────────────────────────────
// PostgreSQL Client
// ──────────────────────────────────────────────────────────────

export class PostgresClient {
    private pool: Pool;

    constructor(connectionString?: string, config?: Partial<PoolConfig>) {
        const connStr = connectionString ?? process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/tradecopier';
        this.pool = new Pool({
            connectionString: connStr,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            ...config,
        });

        this.pool.on('connect', () => log.debug('New PG client connected'));
        this.pool.on('error', (err) => log.error({ error: err }, 'PG pool error'));
    }

    async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
    ): Promise<QueryResult<T>> {
        const start = Date.now();
        try {
            const result = await this.pool.query<T>(text, params);
            const duration = Date.now() - start;
            log.debug({ query: text.slice(0, 80), duration, rows: result.rowCount }, 'Query executed');
            return result;
        } catch (error) {
            log.error({ query: text.slice(0, 80), error }, 'Query failed');
            throw error;
        }
    }

    async transaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const txClient = new TransactionClient(client);
            const result = await fn(txClient);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.pool.query('SELECT 1');
            return true;
        } catch {
            return false;
        }
    }

    async close(): Promise<void> {
        await this.pool.end();
        log.info('PG pool closed');
    }
}

class TransactionClient {
    constructor(private client: import('pg').PoolClient) { }

    async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
    ): Promise<QueryResult<T>> {
        return this.client.query<T>(text, params);
    }
}

// ──────────────────────────────────────────────────────────────
// ClickHouse Client (HTTP interface)
// ──────────────────────────────────────────────────────────────

export class ClickHouseClient {
    private baseUrl: string;

    constructor(url?: string) {
        this.baseUrl = url ?? process.env['CLICKHOUSE_URL'] ?? 'http://localhost:8123';
    }

    async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
        const response = await fetch(`${this.baseUrl}/?query=${encodeURIComponent(sql + ' FORMAT JSON')}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            const text = await response.text();
            log.error({ sql: sql.slice(0, 80), status: response.status, body: text }, 'ClickHouse query failed');
            throw new Error(`ClickHouse query failed: ${text}`);
        }

        const body = await response.json() as { data: T[] };
        return body.data;
    }

    async insert(table: string, rows: Record<string, unknown>[]): Promise<void> {
        if (rows.length === 0) return;

        const columns = Object.keys(rows[0]!);
        const values = rows
            .map((row) =>
                columns.map((col) => {
                    const val = row[col];
                    if (val === null || val === undefined) return 'NULL';
                    if (typeof val === 'string') return `'${val.replace(/'/g, "\\'")}'`;
                    if (val instanceof Date) return `'${val.toISOString()}'`;
                    return String(val);
                }).join(',')
            )
            .map((v) => `(${v})`)
            .join(',');

        const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${values}`;

        const response = await fetch(`${this.baseUrl}/`, {
            method: 'POST',
            body: sql,
            headers: { 'Content-Type': 'text/plain' },
        });

        if (!response.ok) {
            const text = await response.text();
            log.error({ table, rowCount: rows.length, body: text }, 'ClickHouse insert failed');
            throw new Error(`ClickHouse insert failed: ${text}`);
        }

        log.debug({ table, rowCount: rows.length }, 'ClickHouse insert successful');
    }

    async healthCheck(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/ping`);
            return response.ok;
        } catch {
            return false;
        }
    }
}

export { Pool } from 'pg';
export type { QueryResult, QueryResultRow } from 'pg';
