import type { BrokerAccount, SyncConfig, RiskConfig, CreateAccountDTO, CreateSyncConfigDTO, UpdateRiskConfigDTO } from '@tcp/shared-types';
import { KafkaTopic, AccountStatus } from '@tcp/shared-types';
import { generateId, createServiceLogger, NotFoundError, ConflictError, ValidationError } from '@tcp/shared-utils';
import type { AccountRepository } from '../infrastructure/account-repository.js';
import type { SyncConfigRepository } from '../infrastructure/sync-config-repository.js';
import type { RiskConfigRepository } from '../infrastructure/risk-config-repository.js';
import type { CacheManager } from '@tcp/shared-redis';
import type { KafkaProducer } from '@tcp/shared-kafka';

const log = createServiceLogger('account-domain');

export class AccountService {
    constructor(
        private accountRepo: AccountRepository,
        private syncConfigRepo: SyncConfigRepository,
        private riskConfigRepo: RiskConfigRepository,
        private cache: CacheManager,
        private kafkaProducer: KafkaProducer
    ) { }

    // ── Broker Accounts ────────────────────────────────────────

    async createAccount(userId: string, dto: CreateAccountDTO): Promise<BrokerAccount> {
        const existing = await this.accountRepo.findByBrokerAccount(userId, dto.brokerType, dto.accountId);
        if (existing) throw new ConflictError('Broker account already connected');

        const account: BrokerAccount = {
            id: generateId(),
            userId,
            brokerType: dto.brokerType,
            accountId: dto.accountId,
            label: dto.label,
            status: AccountStatus.PENDING,
            isLeader: false,
            credentials: dto.credentials,
            balance: 0,
            equity: 0,
            currency: 'USD',
            lastSyncAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await this.accountRepo.create(account);
        await this.cache.invalidatePattern(`user:${userId}:*`);

        // Create default risk config
        await this.riskConfigRepo.create({
            id: generateId(),
            userId,
            accountId: account.id,
            dailyLossLimit: 0,
            tradeLossLimit: 0,
            maxOpenTrades: 50,
            maxLotSize: 100,
            allowedSymbols: null,
            killSwitchActive: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await this.kafkaProducer.publish(KafkaTopic.ACCOUNT_UPDATED, account.id, { event: 'ACCOUNT_CREATED', account });
        log.info({ accountId: account.id, userId }, 'Broker account created');
        return account;
    }

    async getUserAccounts(userId: string): Promise<BrokerAccount[]> {
        return this.cache.getOrSet(`user:${userId}:accounts`, () => this.accountRepo.findByUserId(userId), 120);
    }

    async getAccount(userId: string, accountId: string): Promise<BrokerAccount> {
        const account = await this.accountRepo.findById(accountId);
        if (!account || account.userId !== userId) throw new NotFoundError('Account', accountId);
        return account;
    }

    async toggleAccount(userId: string, accountId: string, enabled: boolean): Promise<void> {
        const account = await this.getAccount(userId, accountId);
        const status = enabled ? AccountStatus.ACTIVE : AccountStatus.DISABLED;
        await this.accountRepo.updateStatus(accountId, status);
        await this.cache.invalidatePattern(`user:${userId}:*`);
        await this.kafkaProducer.publish(KafkaTopic.ACCOUNT_UPDATED, accountId, { event: 'ACCOUNT_TOGGLED', accountId, status });
    }

    async setLeader(userId: string, accountId: string, isLeader: boolean): Promise<void> {
        await this.getAccount(userId, accountId);
        await this.accountRepo.setLeader(accountId, isLeader);
        await this.cache.invalidatePattern(`user:${userId}:*`);
    }

    async deleteAccount(userId: string, accountId: string): Promise<void> {
        await this.getAccount(userId, accountId);
        await this.accountRepo.delete(accountId);
        await this.cache.invalidatePattern(`user:${userId}:*`);
        log.info({ accountId, userId }, 'Account deleted');
    }

    // ── Sync Configs ───────────────────────────────────────────

    async createSyncConfig(userId: string, dto: CreateSyncConfigDTO): Promise<SyncConfig> {
        // Verify both accounts belong to user
        await this.getAccount(userId, dto.leaderAccountId);
        await this.getAccount(userId, dto.followerAccountId);

        if (dto.leaderAccountId === dto.followerAccountId) {
            throw new ValidationError('Leader and follower cannot be the same account');
        }

        const config: SyncConfig = {
            id: generateId(),
            userId,
            leaderAccountId: dto.leaderAccountId,
            followerAccountId: dto.followerAccountId,
            copyMode: dto.copyMode,
            multiplier: dto.multiplier ?? 1,
            maxLotSize: dto.maxLotSize ?? 100,
            invertTrades: dto.invertTrades ?? false,
            allowedSymbols: dto.allowedSymbols ?? null,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await this.syncConfigRepo.create(config);
        await this.cache.invalidatePattern(`user:${userId}:*`);
        log.info({ configId: config.id }, 'Sync config created');
        return config;
    }

    async getUserSyncConfigs(userId: string): Promise<SyncConfig[]> {
        return this.cache.getOrSet(`user:${userId}:syncs`, () => this.syncConfigRepo.findByUserId(userId), 120);
    }

    async toggleSyncConfig(userId: string, configId: string, enabled: boolean): Promise<void> {
        const config = await this.syncConfigRepo.findById(configId);
        if (!config || config.userId !== userId) throw new NotFoundError('SyncConfig', configId);
        await this.syncConfigRepo.setEnabled(configId, enabled);
        await this.cache.invalidatePattern(`user:${userId}:*`);
    }

    async deleteSyncConfig(userId: string, configId: string): Promise<void> {
        const config = await this.syncConfigRepo.findById(configId);
        if (!config || config.userId !== userId) throw new NotFoundError('SyncConfig', configId);
        await this.syncConfigRepo.delete(configId);
        await this.cache.invalidatePattern(`user:${userId}:*`);
    }

    // ── Risk Configs ───────────────────────────────────────────

    async getRiskConfig(userId: string, accountId: string): Promise<RiskConfig> {
        await this.getAccount(userId, accountId);
        const config = await this.riskConfigRepo.findByAccountId(accountId);
        if (!config) throw new NotFoundError('RiskConfig for account', accountId);
        return config;
    }

    async updateRiskConfig(userId: string, accountId: string, dto: UpdateRiskConfigDTO): Promise<RiskConfig> {
        await this.getAccount(userId, accountId);
        await this.riskConfigRepo.update(accountId, dto);
        await this.cache.invalidatePattern(`user:${userId}:*`);
        const updated = await this.riskConfigRepo.findByAccountId(accountId);
        if (!updated) throw new NotFoundError('RiskConfig', accountId);

        if (dto.killSwitchActive !== undefined) {
            await this.kafkaProducer.publish(KafkaTopic.RISK_ALERT, accountId, {
                event: dto.killSwitchActive ? 'KILL_SWITCH_ACTIVATED' : 'KILL_SWITCH_DEACTIVATED',
                accountId,
                userId,
            });
        }

        return updated;
    }

    // ── leaderAccountId → SyncConfigs (for trade-sync-engine) ─

    async getSyncConfigsForLeader(leaderAccountId: string): Promise<SyncConfig[]> {
        return this.syncConfigRepo.findByLeaderAccountId(leaderAccountId);
    }
}
