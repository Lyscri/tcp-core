import type { SyncConfig } from '@tcp/shared-types';
import type { PostgresClient } from '@tcp/shared-db';

export class SyncConfigRepository {
    constructor(private db: PostgresClient) { }

    async create(config: SyncConfig): Promise<void> {
        await this.db.query(
            `INSERT INTO sync_configs (id,user_id,leader_account_id,follower_account_id,copy_mode,multiplier,max_lot_size,invert_trades,allowed_symbols,enabled,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [config.id, config.userId, config.leaderAccountId, config.followerAccountId, config.copyMode, config.multiplier, config.maxLotSize, config.invertTrades, config.allowedSymbols ? JSON.stringify(config.allowedSymbols) : null, config.enabled, config.createdAt, config.updatedAt]
        );
    }

    async findById(id: string): Promise<SyncConfig | null> {
        const r = await this.db.query<any>('SELECT * FROM sync_configs WHERE id=$1', [id]);
        return r.rows[0] ? this.map(r.rows[0]) : null;
    }

    async findByUserId(userId: string): Promise<SyncConfig[]> {
        const r = await this.db.query<any>('SELECT * FROM sync_configs WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
        return r.rows.map(this.map);
    }

    async findByLeaderAccountId(leaderAccountId: string): Promise<SyncConfig[]> {
        const r = await this.db.query<any>('SELECT * FROM sync_configs WHERE leader_account_id=$1 AND enabled=TRUE', [leaderAccountId]);
        return r.rows.map(this.map);
    }

    async setEnabled(id: string, enabled: boolean): Promise<void> {
        await this.db.query('UPDATE sync_configs SET enabled=$1 WHERE id=$2', [enabled, id]);
    }

    async delete(id: string): Promise<void> {
        await this.db.query('DELETE FROM sync_configs WHERE id=$1', [id]);
    }

    private map(r: any): SyncConfig {
        return {
            id: r.id, userId: r.user_id, leaderAccountId: r.leader_account_id, followerAccountId: r.follower_account_id,
            copyMode: r.copy_mode, multiplier: parseFloat(r.multiplier), maxLotSize: parseFloat(r.max_lot_size),
            invertTrades: r.invert_trades, allowedSymbols: r.allowed_symbols, enabled: r.enabled,
            createdAt: r.created_at, updatedAt: r.updated_at,
        };
    }
}
