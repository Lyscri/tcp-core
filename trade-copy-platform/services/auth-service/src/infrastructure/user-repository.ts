import type { User } from '@tcp/shared-types';
import type { PostgresClient } from '@tcp/shared-db';

export class UserRepository {
    constructor(private db: PostgresClient) { }

    async create(user: User): Promise<void> {
        await this.db.query(
            `INSERT INTO users (id, email, name, password_hash, role, email_verified, two_factor_enabled, two_factor_secret, suspended, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [user.id, user.email, user.name, user.passwordHash, user.role, user.emailVerified, user.twoFactorEnabled, user.twoFactorSecret, user.suspended, user.createdAt, user.updatedAt]
        );
    }

    async findByEmail(email: string): Promise<User | null> {
        const result = await this.db.query<any>(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        return result.rows[0] ? this.mapRow(result.rows[0]) : null;
    }

    async findById(id: string): Promise<User | null> {
        const result = await this.db.query<any>(
            'SELECT * FROM users WHERE id = $1',
            [id]
        );
        return result.rows[0] ? this.mapRow(result.rows[0]) : null;
    }

    async updatePassword(userId: string, passwordHash: string): Promise<void> {
        await this.db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
    }

    async verifyEmail(userId: string): Promise<void> {
        await this.db.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [userId]);
    }

    async enable2FA(userId: string, secret: string): Promise<void> {
        await this.db.query(
            'UPDATE users SET two_factor_enabled = TRUE, two_factor_secret = $1 WHERE id = $2',
            [secret, userId]
        );
    }

    async suspend(userId: string, suspended: boolean): Promise<void> {
        await this.db.query('UPDATE users SET suspended = $1 WHERE id = $2', [suspended, userId]);
    }

    async updateRole(userId: string, role: string): Promise<void> {
        await this.db.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
    }

    async findAll(offset: number, limit: number): Promise<{ users: User[]; total: number }> {
        const countResult = await this.db.query<{ count: string }>('SELECT COUNT(*) as count FROM users');
        const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

        const result = await this.db.query<any>(
            'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );
        return { users: result.rows.map(this.mapRow), total };
    }

    private mapRow(row: any): User {
        return {
            id: row.id,
            email: row.email,
            name: row.name,
            passwordHash: row.password_hash,
            role: row.role,
            emailVerified: row.email_verified,
            twoFactorEnabled: row.two_factor_enabled,
            twoFactorSecret: row.two_factor_secret,
            suspended: row.suspended,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}
