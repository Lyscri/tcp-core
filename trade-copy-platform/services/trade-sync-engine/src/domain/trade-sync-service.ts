import type { KafkaMessage, TradeEventDTO, SyncConfig, RiskValidationRequest, RiskValidationResponse } from '@tcp/shared-types';
import { KafkaTopic, CopyMode, OrderSide } from '@tcp/shared-types';
import { createServiceLogger, generateId, retry } from '@tcp/shared-utils';
import type { DistributedLock } from '@tcp/shared-redis';
import type { KafkaProducer } from '@tcp/shared-kafka';
import type Redis from 'ioredis';

const log = createServiceLogger('trade-sync');

export class TradeSyncService {
    constructor(
        private redis: Redis,
        private lock: DistributedLock,
        private producer: KafkaProducer,
        private accountServiceUrl: string,
        private riskEngineUrl: string,
        private brokerAdapterUrl: string
    ) { }

    async processTradeEvent(message: KafkaMessage<TradeEventDTO>): Promise<void> {
        const event = message.payload as TradeEventDTO;
        const startTime = Date.now();

        try {
            // ── 1. Idempotency Check ──────────────────────────────
            const idempotencyKey = `sync:idem:${event.idempotencyKey}`;
            const already = await this.redis.set(idempotencyKey, '1', 'EX', 86400, 'NX');
            if (!already) {
                log.warn({ idempotencyKey: event.idempotencyKey }, 'Duplicate event, skipping');
                return;
            }

            // ── 2. Get Sync Configs for leader ────────────────────
            const syncConfigs = await this.fetchSyncConfigs(event.accountId);
            if (syncConfigs.length === 0) {
                log.debug({ accountId: event.accountId }, 'No sync configs for leader account');
                return;
            }

            // ── 3. Replicate to each follower ─────────────────────
            const results = await Promise.allSettled(
                syncConfigs.map((config) => this.replicateToFollower(event, config, message.correlationId))
            );

            let successCount = 0;
            let failCount = 0;
            for (const result of results) {
                if (result.status === 'fulfilled') successCount++;
                else failCount++;
            }

            await this.redis.incr('sync:stats:processed');
            if (failCount > 0) await this.redis.incrby('sync:stats:failed', failCount);

            log.info({
                tradeId: event.tradeId,
                followers: syncConfigs.length,
                success: successCount,
                failed: failCount,
                latencyMs: Date.now() - startTime,
            }, 'Trade replication completed');
        } catch (error) {
            log.error({ error, tradeId: event.tradeId }, 'Trade event processing failed');
            await this.redis.incr('sync:stats:failed');

            // Publish to failed queue for retry
            await this.producer.publish(KafkaTopic.TRADE_FAILED, event.tradeId, {
                originalEvent: event,
                error: error instanceof Error ? error.message : String(error),
                timestamp: Date.now(),
            });
        }
    }

    private async replicateToFollower(
        event: TradeEventDTO,
        config: SyncConfig,
        correlationId: string
    ): Promise<void> {
        const lockKey = `sync:lock:${config.followerAccountId}:${event.symbol}`;

        await this.lock.withLock(lockKey, 10_000, async () => {
            // ── Symbol filter ───────────────────────────────────
            if (config.allowedSymbols && !config.allowedSymbols.includes(event.symbol)) {
                log.debug({ symbol: event.symbol, configId: config.id }, 'Symbol not in allowed list, skipping');
                return;
            }

            // ── Calculate lots ──────────────────────────────────
            const lots = this.calculateLots(event.lots, config);

            // ── Invert side if configured ───────────────────────
            const side = config.invertTrades
                ? (event.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY)
                : event.side;

            // ── Risk validation ─────────────────────────────────
            const riskCheck: RiskValidationRequest = {
                userId: config.userId,
                accountId: config.followerAccountId,
                symbol: event.symbol,
                side,
                lots,
                estimatedLoss: lots * 100, // simplified estimation
            };

            const riskResult = await this.validateRisk(riskCheck);
            if (!riskResult.allowed) {
                log.warn({
                    accountId: config.followerAccountId,
                    reason: riskResult.reason,
                }, 'Trade blocked by risk engine');

                await this.producer.publish(KafkaTopic.RISK_ALERT, config.followerAccountId, {
                    event: 'TRADE_BLOCKED',
                    reason: riskResult.reason,
                    trade: event,
                    config: config.id,
                });
                return;
            }

            // ── Execute on follower broker ──────────────────────
            const followerTrade: TradeEventDTO = {
                tradeId: generateId(),
                accountId: config.followerAccountId,
                userId: config.userId,
                brokerType: event.brokerType,
                symbol: event.symbol,
                side,
                type: event.type,
                lots,
                price: event.price,
                stopLoss: event.stopLoss,
                takeProfit: event.takeProfit,
                idempotencyKey: `${event.idempotencyKey}_${config.followerAccountId}`,
                timestamp: Date.now(),
            };

            await retry(async () => {
                await this.executeTrade(followerTrade);
            }, { maxAttempts: 3, baseDelayMs: 200 });

            // ── Publish success event ───────────────────────────
            await this.producer.publish(KafkaTopic.TRADE_REPLICATED, followerTrade.tradeId, {
                sourceTradeId: event.tradeId,
                followerTradeId: followerTrade.tradeId,
                configId: config.id,
                followerAccountId: config.followerAccountId,
                latencyMs: Date.now() - event.timestamp,
            }, correlationId);

            log.info({
                sourceTradeId: event.tradeId,
                followerTradeId: followerTrade.tradeId,
                followerAccountId: config.followerAccountId,
                lots,
                latencyMs: Date.now() - event.timestamp,
            }, 'Trade replicated to follower');
        });
    }

    private calculateLots(leaderLots: number, config: SyncConfig): number {
        switch (config.copyMode) {
            case CopyMode.FIXED:
                return Math.min(leaderLots, config.maxLotSize);
            case CopyMode.PROPORTIONAL:
                return Math.min(leaderLots * config.multiplier, config.maxLotSize);
            case CopyMode.MULTIPLIER:
                return Math.min(leaderLots * config.multiplier, config.maxLotSize);
            case CopyMode.RISK_BASED:
                return Math.min(leaderLots * config.multiplier * 0.5, config.maxLotSize);
            default:
                return leaderLots;
        }
    }

    private async fetchSyncConfigs(leaderAccountId: string): Promise<SyncConfig[]> {
        const cacheKey = `sync:configs:${leaderAccountId}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const response = await fetch(
            `${this.accountServiceUrl}/accounts/internal/sync-configs/leader/${leaderAccountId}`,
            { signal: AbortSignal.timeout(5000) }
        );

        if (!response.ok) {
            log.error({ leaderAccountId, status: response.status }, 'Failed to fetch sync configs');
            return [];
        }

        const body = await response.json() as any;
        const configs = body.data ?? [];
        await this.redis.setex(cacheKey, 30, JSON.stringify(configs)); // 30s cache
        return configs;
    }

    private async validateRisk(request: RiskValidationRequest): Promise<RiskValidationResponse> {
        try {
            const response = await fetch(`${this.riskEngineUrl}/risk/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
                signal: AbortSignal.timeout(3000),
            });

            if (!response.ok) {
                return { allowed: false, reason: 'Risk engine unavailable' };
            }

            const body = await response.json() as any;
            return body.data;
        } catch (error) {
            log.error({ error }, 'Risk validation failed, defaulting to reject');
            return { allowed: false, reason: 'Risk engine unreachable' };
        }
    }

    private async executeTrade(trade: TradeEventDTO): Promise<void> {
        const response = await fetch(`${this.brokerAdapterUrl}/broker/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(trade),
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Broker execution failed: ${text}`);
        }
    }
}
