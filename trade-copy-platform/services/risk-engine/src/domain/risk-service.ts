import type { RiskValidationRequest, RiskValidationResponse, RiskConfig } from '@tcp/shared-types';
import { KafkaTopic } from '@tcp/shared-types';
import { createServiceLogger } from '@tcp/shared-utils';
import type { PostgresClient } from '@tcp/shared-db';
import type { KafkaProducer } from '@tcp/shared-kafka';
import type Redis from 'ioredis';

const log = createServiceLogger('risk-domain');

interface RiskState {
    dailyPnl: number;
    openTradeCount: number;
    totalLotSize: number;
}

export class RiskService {
    constructor(
        private db: PostgresClient,
        private redis: Redis,
        private producer: KafkaProducer
    ) { }

    async validateTrade(request: RiskValidationRequest): Promise<RiskValidationResponse> {
        // ── Global kill switch check ─────────────────────────
        const globalKill = await this.redis.get('risk:global:kill');
        if (globalKill === '1') {
            return { allowed: false, reason: 'Global kill switch is active', ruleViolated: 'GLOBAL_KILL_SWITCH' };
        }

        // ── Per-account kill switch ──────────────────────────
        const accountKill = await this.redis.get(`risk:kill:${request.accountId}`);
        if (accountKill === '1') {
            return { allowed: false, reason: 'Account kill switch is active', ruleViolated: 'ACCOUNT_KILL_SWITCH' };
        }

        // ── Load risk config ─────────────────────────────────
        const config = await this.getRiskConfig(request.accountId);
        if (!config) {
            // No config = allow (fail-open for accounts without risk config)
            return { allowed: true };
        }

        // ── Rule: Kill Switch Active ─────────────────────────
        if (config.killSwitchActive) {
            return { allowed: false, reason: 'Kill switch active on risk config', ruleViolated: 'CONFIG_KILL_SWITCH' };
        }

        // ── Get risk state ───────────────────────────────────
        const state = await this.getRiskState(request.accountId);

        // ── Rule: Daily Loss Limit ───────────────────────────
        if (config.dailyLossLimit > 0) {
            const projectedLoss = state.dailyPnl - request.estimatedLoss;
            if (projectedLoss < -config.dailyLossLimit) {
                await this.publishAlert(request, 'DAILY_LOSS_LIMIT', `Daily loss would exceed limit: ${config.dailyLossLimit}`);
                return { allowed: false, reason: `Daily loss limit exceeded (limit: ${config.dailyLossLimit})`, ruleViolated: 'DAILY_LOSS_LIMIT' };
            }
        }

        // ── Rule: Trade Loss Limit ───────────────────────────
        if (config.tradeLossLimit > 0 && request.estimatedLoss > config.tradeLossLimit) {
            return { allowed: false, reason: `Trade loss exceeds limit (limit: ${config.tradeLossLimit})`, ruleViolated: 'TRADE_LOSS_LIMIT' };
        }

        // ── Rule: Max Open Trades ────────────────────────────
        if (config.maxOpenTrades > 0 && state.openTradeCount >= config.maxOpenTrades) {
            return { allowed: false, reason: `Max open trades reached (limit: ${config.maxOpenTrades})`, ruleViolated: 'MAX_OPEN_TRADES' };
        }

        // ── Rule: Max Lot Size ───────────────────────────────
        if (config.maxLotSize > 0 && request.lots > config.maxLotSize) {
            return { allowed: false, reason: `Lot size exceeds limit (limit: ${config.maxLotSize})`, ruleViolated: 'MAX_LOT_SIZE' };
        }

        // ── Rule: Allowed Symbols ────────────────────────────
        if (config.allowedSymbols && config.allowedSymbols.length > 0) {
            if (!config.allowedSymbols.includes(request.symbol)) {
                return { allowed: false, reason: `Symbol ${request.symbol} not in allowed list`, ruleViolated: 'SYMBOL_NOT_ALLOWED' };
            }
        }

        return { allowed: true };
    }

    async getRiskConfig(accountId: string): Promise<RiskConfig | null> {
        // Check cache first
        const cached = await this.redis.get(`risk:config:${accountId}`);
        if (cached) return JSON.parse(cached);

        const result = await this.db.query<any>(
            'SELECT * FROM risk_configs WHERE account_id = $1',
            [accountId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        const config: RiskConfig = {
            id: row.id,
            userId: row.user_id,
            accountId: row.account_id,
            dailyLossLimit: parseFloat(row.daily_loss_limit),
            tradeLossLimit: parseFloat(row.trade_loss_limit),
            maxOpenTrades: row.max_open_trades,
            maxLotSize: parseFloat(row.max_lot_size),
            allowedSymbols: row.allowed_symbols,
            killSwitchActive: row.kill_switch_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };

        await this.redis.setex(`risk:config:${accountId}`, 60, JSON.stringify(config));
        return config;
    }

    async getRiskState(accountId: string): Promise<RiskState> {
        const pipeline = this.redis.pipeline();
        pipeline.get(`risk:state:${accountId}:dailyPnl`);
        pipeline.get(`risk:state:${accountId}:openTrades`);
        pipeline.get(`risk:state:${accountId}:totalLots`);
        const results = await pipeline.exec();

        return {
            dailyPnl: parseFloat((results?.[0]?.[1] as string) ?? '0'),
            openTradeCount: parseInt((results?.[1]?.[1] as string) ?? '0', 10),
            totalLotSize: parseFloat((results?.[2]?.[1] as string) ?? '0'),
        };
    }

    async updateRiskState(
        accountId: string,
        pnlDelta: number,
        openTradesDelta: number,
        lotsDelta: number
    ): Promise<void> {
        const pipeline = this.redis.pipeline();
        pipeline.incrbyfloat(`risk:state:${accountId}:dailyPnl`, pnlDelta);
        pipeline.incrby(`risk:state:${accountId}:openTrades`, openTradesDelta);
        pipeline.incrbyfloat(`risk:state:${accountId}:totalLots`, lotsDelta);
        // Auto-expire at midnight UTC
        const secondsUntilMidnight = this.getSecondsUntilMidnight();
        pipeline.expire(`risk:state:${accountId}:dailyPnl`, secondsUntilMidnight);
        pipeline.expire(`risk:state:${accountId}:openTrades`, secondsUntilMidnight);
        pipeline.expire(`risk:state:${accountId}:totalLots`, secondsUntilMidnight);
        await pipeline.exec();
    }

    async setKillSwitch(accountId: string, activate: boolean): Promise<void> {
        if (activate) {
            await this.redis.set(`risk:kill:${accountId}`, '1');
            await this.db.query('UPDATE risk_configs SET kill_switch_active = TRUE WHERE account_id = $1', [accountId]);
        } else {
            await this.redis.del(`risk:kill:${accountId}`);
            await this.db.query('UPDATE risk_configs SET kill_switch_active = FALSE WHERE account_id = $1', [accountId]);
        }
        log.info({ accountId, activate }, 'Kill switch toggled');
    }

    async isKillSwitchActive(accountId: string): Promise<boolean> {
        const result = await this.redis.get(`risk:kill:${accountId}`);
        return result === '1';
    }

    async setGlobalKillSwitch(activate: boolean): Promise<void> {
        if (activate) {
            await this.redis.set('risk:global:kill', '1');
        } else {
            await this.redis.del('risk:global:kill');
        }
        log.warn({ activate }, 'Global kill switch toggled');
    }

    private async publishAlert(request: RiskValidationRequest, rule: string, message: string): Promise<void> {
        try {
            await this.producer.connect();
            await this.producer.publish(KafkaTopic.RISK_ALERT, request.accountId, {
                event: 'RISK_LIMIT_HIT',
                rule,
                message,
                userId: request.userId,
                accountId: request.accountId,
                symbol: request.symbol,
                lots: request.lots,
            });
        } catch (error) {
            log.error({ error }, 'Failed to publish risk alert');
        }
    }

    private getSecondsUntilMidnight(): number {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setUTCHours(24, 0, 0, 0);
        return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
    }
}
