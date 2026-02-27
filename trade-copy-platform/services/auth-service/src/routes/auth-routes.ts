import { Hono } from 'hono';
import type { AuthService } from '../domain/auth-service.js';
import { registerSchema, loginSchema, ValidationError } from '@tcp/shared-utils';
import { authMiddleware } from '../middleware/auth.js';

export function createAuthRoutes(authService: AuthService): Hono {
    const router = new Hono();

    // ── Register ───────────────────────────────────────────────
    router.post('/register', async (c) => {
        const body = await c.req.json();
        const parsed = registerSchema.safeParse(body);
        if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten());

        const tokens = await authService.register(parsed.data);
        return c.json({ success: true, data: tokens }, 201);
    });

    // ── Login ──────────────────────────────────────────────────
    router.post('/login', async (c) => {
        const body = await c.req.json();
        const parsed = loginSchema.safeParse(body);
        if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten());

        const result = await authService.login(parsed.data);
        if (result.requiresTwoFactor) {
            return c.json({ success: true, data: { requiresTwoFactor: true } });
        }
        return c.json({ success: true, data: result });
    });

    // ── Logout ─────────────────────────────────────────────────
    router.post('/logout', async (c) => {
        const body = await c.req.json();
        if (!body.refreshToken) throw new ValidationError('refreshToken required');
        await authService.logout(body.refreshToken);
        return c.json({ success: true });
    });

    // ── Refresh Token ──────────────────────────────────────────
    router.post('/refresh', async (c) => {
        const body = await c.req.json();
        if (!body.refreshToken) throw new ValidationError('refreshToken required');
        const tokens = await authService.refresh(body.refreshToken);
        return c.json({ success: true, data: tokens });
    });

    // ── Password Reset ─────────────────────────────────────────
    router.post('/forgot-password', async (c) => {
        const { email } = await c.req.json();
        if (!email) throw new ValidationError('email required');
        const result = await authService.requestPasswordReset(email);
        return c.json({ success: true, data: { message: 'If the email exists, a reset link has been sent' } });
    });

    router.post('/reset-password', async (c) => {
        const { token, newPassword } = await c.req.json();
        if (!token || !newPassword) throw new ValidationError('token and newPassword required');
        await authService.resetPassword(token, newPassword);
        return c.json({ success: true });
    });

    // ── Email Verification ─────────────────────────────────────
    router.post('/verify-email', async (c) => {
        const { token } = await c.req.json();
        if (!token) throw new ValidationError('token required');
        await authService.verifyEmail(token);
        return c.json({ success: true });
    });

    // ── 2FA ────────────────────────────────────────────────────
    router.post('/2fa/setup', authMiddleware, async (c) => {
        const userId = c.get('userId' as never) as string;
        const result = await authService.setup2FA(userId);
        return c.json({ success: true, data: result });
    });

    router.post('/2fa/verify', authMiddleware, async (c) => {
        const userId = c.get('userId' as never) as string;
        const { code } = await c.req.json();
        if (!code) throw new ValidationError('code required');
        await authService.verify2FA(userId, code);
        return c.json({ success: true });
    });

    // ── Profile ────────────────────────────────────────────────
    router.get('/profile', authMiddleware, async (c) => {
        const userId = c.get('userId' as never) as string;
        const profile = await authService.getProfile(userId);
        return c.json({ success: true, data: profile });
    });

    // ── Token verification endpoint (for gateway) ──────────────
    router.post('/verify-token', async (c) => {
        const { token } = await c.req.json();
        try {
            const { AuthService: AS } = await import('../domain/auth-service.js');
            const payload = AS.verifyAccessToken(token);
            return c.json({ success: true, data: payload });
        } catch {
            return c.json({ success: false, error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid token' } }, 401);
        }
    });

    return router;
}
