import type { RefreshToken } from '@tcp/shared-types';
import type { PostgresClient } from '@tcp/shared-db';
import { generateId } from '@tcp/shared-utils';

export class TokenRepository {
    constructor(private db: PostgresClient) { }

    async create(token: RefreshToken): Promise<void> {
        await this.db.query(
            `INSERT INTO refresh_tokens (id, user_id, token_hash, family, expires_at, revoked_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [token.id, token.userId, token.tokenHash, token.family, token.expiresAt, token.revokedAt, token.createdAt]
        );
    }

    async findByHash(tokenHash: string): Promise<RefreshToken | null> {
        const result = await this.db.query<any>(
            'SELECT * FROM refresh_tokens WHERE token_hash = $1',
            [tokenHash]
        );
        return result.rows[0] ? this.mapRow(result.rows[0]) : null;
    }

    async revoke(tokenId: string): Promise<void> {
        await this.db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [tokenId]);
    }

    async revokeFamily(family: string): Promise<void> {
        await this.db.query(
            'UPDATE refresh_tokens SET revoked_at = NOW() WHERE family = $1 AND revoked_at IS NULL',
            [family]
        );
    }

    async revokeAllUserTokens(userId: string): Promise<void> {
        await this.db.query(
            'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
            [userId]
        );
    }

    // ── Password Reset Tokens ─────────────────────────────────

    async createPasswordReset(userId: string, tokenHash: string): Promise<void> {
        const id = generateId();
        const expiresAt = new Date(Date.now() + 3600_000); // 1 hour
        await this.db.query(
            `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
            [id, userId, tokenHash, expiresAt]
        );
    }

    async findPasswordReset(tokenHash: string): Promise<any | null> {
        const result = await this.db.query(
            'SELECT * FROM password_reset_tokens WHERE token_hash = $1',
            [tokenHash]
        );
        return result.rows[0] ?? null;
    }

    async markPasswordResetUsed(id: string): Promise<void> {
        await this.db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [id]);
    }

    // ── Email Verification Tokens ──────────────────────────────

    async createEmailVerification(userId: string, tokenHash: string): Promise<void> {
        const id = generateId();
        const expiresAt = new Date(Date.now() + 86400_000); // 24 hours
        await this.db.query(
            `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
            [id, userId, tokenHash, expiresAt]
        );
    }

    async findEmailVerification(tokenHash: string): Promise<any | null> {
        const result = await this.db.query(
            'SELECT * FROM email_verification_tokens WHERE token_hash = $1',
            [tokenHash]
        );
        return result.rows[0] ?? null;
    }

    async markEmailVerificationUsed(id: string): Promise<void> {
        await this.db.query('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1', [id]);
    }

    private mapRow(row: any): RefreshToken {
        return {
            id: row.id,
            userId: row.user_id,
            tokenHash: row.token_hash,
            family: row.family,
            expiresAt: row.expires_at,
            revokedAt: row.revoked_at,
            createdAt: row.created_at,
        };
    }
}
