import type { BrokerAccount, AccountStatus } from '@tcp/shared-types';
import type { PostgresClient } from '@tcp/shared-db';

export class AccountRepository {
    constructor(private db: PostgresClient) { }

    async create(account: BrokerAccount): Promise<void> {
        await this.db.query(
            `INSERT INTO broker_accounts (id, user_id, broker_type, account_id, label, status, is_leader, credentials, balance, equity, currency, last_sync_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [account.id, account.userId, account.brokerType, account.accountId, account.label, account.status, account.isLeader, JSON.stringify(account.credentials), account.balance, account.equity, account.currency, account.lastSyncAt, account.createdAt, account.updatedAt]
        );
    }

    async findById(id: string): Promise<BrokerAccount | null> {
        const r = await this.db.query<any>('SELECT * FROM broker_accounts WHERE id = $1', [id]);
        return r.rows[0] ? this.map(r.rows[0]) : null;
    }

    async findByUserId(userId: string): Promise<BrokerAccount[]> {
        const r = await this.db.query<any>('SELECT * FROM broker_accounts WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        return r.rows.map(this.map);
    }

    async findByBrokerAccount(userId: string, brokerType: string, accountId: string): Promise<BrokerAccount | null> {
        const r = await this.db.query<any>('SELECT * FROM broker_accounts WHERE user_id=$1 AND broker_type=$2 AND account_id=$3', [userId, brokerType, accountId]);
        return r.rows[0] ? this.map(r.rows[0]) : null;
    }

    async updateStatus(id: string, status: AccountStatus): Promise<void> {
        await this.db.query('UPDATE broker_accounts SET status=$1 WHERE id=$2', [status, id]);
    }

    async setLeader(id: string, isLeader: boolean): Promise<void> {
        await this.db.query('UPDATE broker_accounts SET is_leader=$1 WHERE id=$2', [isLeader, id]);
    }

    async updateBalance(id: string, balance: number, equity: number): Promise<void> {
        await this.db.query('UPDATE broker_accounts SET balance=$1, equity=$2, last_sync_at=NOW() WHERE id=$3', [balance, equity, id]);
    }

    async delete(id: string): Promise<void> {
        await this.db.query('DELETE FROM broker_accounts WHERE id=$1', [id]);
    }

    private map(r: any): BrokerAccount {
        return {
            id: r.id, userId: r.user_id, brokerType: r.broker_type, accountId: r.account_id,
            label: r.label, status: r.status, isLeader: r.is_leader,
            credentials: typeof r.credentials === 'string' ? JSON.parse(r.credentials) : r.credentials,
            balance: parseFloat(r.balance), equity: parseFloat(r.equity), currency: r.currency,
            lastSyncAt: r.last_sync_at, createdAt: r.created_at, updatedAt: r.updated_at,
        };
    }
}
