import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { createHash, randomBytes } from 'node:crypto';
import type { User, AuthTokens, RegisterDTO, LoginDTO } from '@tcp/shared-types';
import { Role } from '@tcp/shared-types';
import {
    hashPassword,
    verifyPassword,
    generateId,
    createServiceLogger,
    AuthenticationError,
    ConflictError,
    ValidationError,
    NotFoundError,
} from '@tcp/shared-utils';
import type { UserRepository } from '../infrastructure/user-repository.js';
import type { TokenRepository } from '../infrastructure/token-repository.js';
import type Redis from 'ioredis';

const log = createServiceLogger('auth-domain');
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production-min32chars!!';
const JWT_EXPIRES_IN = process.env['JWT_EXPIRES_IN'] ?? '15m';
const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class AuthService {
    constructor(
        private userRepo: UserRepository,
        private tokenRepo: TokenRepository,
        private redis: Redis
    ) { }

    // ── Registration ───────────────────────────────────────────

    async register(dto: RegisterDTO): Promise<AuthTokens> {
        const existing = await this.userRepo.findByEmail(dto.email);
        if (existing) throw new ConflictError('Email already registered');

        const passwordHash = await hashPassword(dto.password);
        const user: User = {
            id: generateId(),
            email: dto.email.toLowerCase().trim(),
            name: dto.name,
            passwordHash,
            role: Role.USER,
            emailVerified: false,
            twoFactorEnabled: false,
            twoFactorSecret: null,
            suspended: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await this.userRepo.create(user);
        log.info({ userId: user.id }, 'User registered');

        return this.issueTokens(user);
    }

    // ── Login ──────────────────────────────────────────────────

    async login(dto: LoginDTO): Promise<AuthTokens & { requiresTwoFactor?: boolean }> {
        const user = await this.userRepo.findByEmail(dto.email.toLowerCase().trim());
        if (!user) throw new AuthenticationError('Invalid email or password');
        if (user.suspended) throw new AuthenticationError('Account suspended');

        // Brute-force check
        const failKey = `auth:fail:${user.id}`;
        const failures = parseInt((await this.redis.get(failKey)) ?? '0', 10);
        if (failures >= 10) {
            throw new AuthenticationError('Account temporarily locked due to too many failed attempts');
        }

        const valid = await verifyPassword(dto.password, user.passwordHash);
        if (!valid) {
            await this.redis.incr(failKey);
            await this.redis.expire(failKey, 900); // 15 min lockout window
            throw new AuthenticationError('Invalid email or password');
        }

        // Reset failed attempts on success
        await this.redis.del(failKey);

        // 2FA Check
        if (user.twoFactorEnabled) {
            if (!dto.twoFactorCode) {
                return { accessToken: '', refreshToken: '', expiresIn: 0, requiresTwoFactor: true };
            }
            if (!user.twoFactorSecret) throw new AuthenticationError('2FA not properly configured');
            const valid2fa = authenticator.verify({ token: dto.twoFactorCode, secret: user.twoFactorSecret });
            if (!valid2fa) throw new AuthenticationError('Invalid 2FA code');
        }

        log.info({ userId: user.id }, 'User logged in');
        return this.issueTokens(user);
    }

    // ── Logout ─────────────────────────────────────────────────

    async logout(refreshToken: string): Promise<void> {
        const tokenHash = this.hashToken(refreshToken);
        const stored = await this.tokenRepo.findByHash(tokenHash);
        if (stored) {
            // Revoke entire token family (prevent replay)
            await this.tokenRepo.revokeFamily(stored.family);
        }
    }

    // ── Refresh ────────────────────────────────────────────────

    async refresh(refreshToken: string): Promise<AuthTokens> {
        const tokenHash = this.hashToken(refreshToken);
        const storedToken = await this.tokenRepo.findByHash(tokenHash);

        if (!storedToken) throw new AuthenticationError('Invalid refresh token');
        if (storedToken.revokedAt) {
            // Token reuse detected — revoke entire family
            await this.tokenRepo.revokeFamily(storedToken.family);
            log.warn({ family: storedToken.family }, 'Refresh token reuse detected, family revoked');
            throw new AuthenticationError('Refresh token reuse detected');
        }
        if (new Date(storedToken.expiresAt) < new Date()) {
            throw new AuthenticationError('Refresh token expired');
        }

        // Revoke current token
        await this.tokenRepo.revoke(storedToken.id);

        const user = await this.userRepo.findById(storedToken.userId);
        if (!user) throw new AuthenticationError('User not found');
        if (user.suspended) throw new AuthenticationError('Account suspended');

        // Issue new tokens with same family (rotation)
        return this.issueTokens(user, storedToken.family);
    }

    // ── 2FA Setup ──────────────────────────────────────────────

    async setup2FA(userId: string): Promise<{ secret: string; qrCode: string }> {
        const user = await this.userRepo.findById(userId);
        if (!user) throw new NotFoundError('User', userId);

        const secret = authenticator.generateSecret();
        const otpauth = authenticator.keyuri(user.email, 'TradeCopyPlatform', secret);
        const qrCode = await qrcode.toDataURL(otpauth);

        // Store secret temporarily in Redis until verified
        await this.redis.setex(`2fa:setup:${userId}`, 600, secret);

        return { secret, qrCode };
    }

    async verify2FA(userId: string, code: string): Promise<void> {
        const secret = await this.redis.get(`2fa:setup:${userId}`);
        if (!secret) throw new ValidationError('2FA setup expired, please start again');

        const valid = authenticator.verify({ token: code, secret });
        if (!valid) throw new ValidationError('Invalid 2FA code');

        await this.userRepo.enable2FA(userId, secret);
        await this.redis.del(`2fa:setup:${userId}`);
        log.info({ userId }, '2FA enabled');
    }

    // ── Password Reset ─────────────────────────────────────────

    async requestPasswordReset(email: string): Promise<{ token: string }> {
        const user = await this.userRepo.findByEmail(email.toLowerCase().trim());
        if (!user) {
            // Don't reveal whether email exists
            return { token: '' };
        }

        const token = randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(token);
        await this.tokenRepo.createPasswordReset(user.id, tokenHash);

        // In production: send email with token
        log.info({ userId: user.id }, 'Password reset requested');
        return { token };
    }

    async resetPassword(token: string, newPassword: string): Promise<void> {
        const tokenHash = this.hashToken(token);
        const resetToken = await this.tokenRepo.findPasswordReset(tokenHash);

        if (!resetToken || resetToken.used_at || new Date(resetToken.expires_at) < new Date()) {
            throw new ValidationError('Invalid or expired reset token');
        }

        const passwordHash = await hashPassword(newPassword);
        await this.userRepo.updatePassword(resetToken.user_id, passwordHash);
        await this.tokenRepo.markPasswordResetUsed(resetToken.id);

        // Revoke all existing refresh tokens
        await this.tokenRepo.revokeAllUserTokens(resetToken.user_id);

        log.info({ userId: resetToken.user_id }, 'Password reset completed');
    }

    // ── Verify Email ───────────────────────────────────────────

    async requestEmailVerification(userId: string): Promise<{ token: string }> {
        const token = randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(token);
        await this.tokenRepo.createEmailVerification(userId, tokenHash);

        // In production: send verification email
        return { token };
    }

    async verifyEmail(token: string): Promise<void> {
        const tokenHash = this.hashToken(token);
        const verifyToken = await this.tokenRepo.findEmailVerification(tokenHash);

        if (!verifyToken || verifyToken.used_at || new Date(verifyToken.expires_at) < new Date()) {
            throw new ValidationError('Invalid or expired verification token');
        }

        await this.userRepo.verifyEmail(verifyToken.user_id);
        await this.tokenRepo.markEmailVerificationUsed(verifyToken.id);
        log.info({ userId: verifyToken.user_id }, 'Email verified');
    }

    // ── Get User Profile ────────────────────────────────────────

    async getProfile(userId: string): Promise<Omit<User, 'passwordHash' | 'twoFactorSecret'>> {
        const user = await this.userRepo.findById(userId);
        if (!user) throw new NotFoundError('User', userId);

        const { passwordHash, twoFactorSecret, ...profile } = user;
        return profile;
    }

    // ── Token Helpers ──────────────────────────────────────────

    private async issueTokens(user: User, family?: string): Promise<AuthTokens> {
        const accessToken = jwt.sign(
            { sub: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        const refreshTokenValue = randomBytes(40).toString('hex');
        const tokenFamily = family ?? randomBytes(16).toString('hex');
        const tokenHash = this.hashToken(refreshTokenValue);

        await this.tokenRepo.create({
            id: generateId(),
            userId: user.id,
            tokenHash,
            family: tokenFamily,
            expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
            revokedAt: null,
            createdAt: new Date(),
        });

        return {
            accessToken,
            refreshToken: refreshTokenValue,
            expiresIn: 900, // 15 min in seconds
        };
    }

    private hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    // ── JWT Verification (used by other services / gateway) ────

    static verifyAccessToken(token: string): { sub: string; email: string; role: string } {
        return jwt.verify(token, JWT_SECRET) as { sub: string; email: string; role: string };
    }
}
