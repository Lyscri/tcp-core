import type { RiskConfig, UpdateRiskConfigDTO } from '@tcp/shared-types';
import type { PostgresClient } from '@tcp/shared-db';

export class RiskConfigRepository {
    constructor(private db: PostgresClient) { }

    async create(config: RiskConfig): Promise<void> {
        await this.db.query(
            `INSERT INTO risk_configs (id,user_id,account_id,daily_loss_limit,trade_loss_limit,max_open_trades,max_lot_size,allowed_symbols,kill_switch_active,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [config.id, config.userId, config.accountId, config.dailyLossLimit, config.tradeLossLimit, config.maxOpenTrades, config.maxLotSize, config.allowedSymbols ? JSON.stringify(config.allowedSymbols) : null, config.killSwitchActive, config.createdAt, config.updatedAt]
        );
    }

    async findByAccountId(accountId: string): Promise<RiskConfig | null> {
        const r = await this.db.query<any>('SELECT * FROM risk_configs WHERE account_id=$1', [accountId]);
        return r.rows[0] ? this.map(r.rows[0]) : null;
    }

    async update(accountId: string, dto: UpdateRiskConfigDTO): Promise<void> {
        const sets: string[] = [];
        const vals: unknown[] = [];
        let i = 1;
        if (dto.dailyLossLimit !== undefined) { sets.push(`daily_loss_limit=$${i++}`); vals.push(dto.dailyLossLimit); }
        if (dto.tradeLossLimit !== undefined) { sets.push(`trade_loss_limit=$${i++}`); vals.push(dto.tradeLossLimit); }
        if (dto.maxOpenTrades !== undefined) { sets.push(`max_open_trades=$${i++}`); vals.push(dto.maxOpenTrades); }
        if (dto.maxLotSize !== undefined) { sets.push(`max_lot_size=$${i++}`); vals.push(dto.maxLotSize); }
        if (dto.allowedSymbols !== undefined) { sets.push(`allowed_symbols=$${i++}`); vals.push(dto.allowedSymbols ? JSON.stringify(dto.allowedSymbols) : null); }
        if (dto.killSwitchActive !== undefined) { sets.push(`kill_switch_active=$${i++}`); vals.push(dto.killSwitchActive); }
        if (sets.length === 0) return;
        vals.push(accountId);
        await this.db.query(`UPDATE risk_configs SET ${sets.join(',')} WHERE account_id=$${i}`, vals);
    }

    private map(r: any): RiskConfig {
        return {
            id: r.id, userId: r.user_id, accountId: r.account_id,
            dailyLossLimit: parseFloat(r.daily_loss_limit), tradeLossLimit: parseFloat(r.trade_loss_limit),
            maxOpenTrades: r.max_open_trades, maxLotSize: parseFloat(r.max_lot_size),
            allowedSymbols: r.allowed_symbols, killSwitchActive: r.kill_switch_active,
            createdAt: r.created_at, updatedAt: r.updated_at,
        };
    }
}
