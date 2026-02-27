import type { Context, Next } from 'hono';
import { AuthenticationError } from '@tcp/shared-utils';
import { AuthService } from '../domain/auth-service.js';

export async function authMiddleware(c: Context, next: Next): Promise<void> {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        throw new AuthenticationError('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    try {
        const payload = AuthService.verifyAccessToken(token);
        c.set('userId' as never, payload.sub as never);
        c.set('userEmail' as never, payload.email as never);
        c.set('userRole' as never, payload.role as never);
        await next();
    } catch {
        throw new AuthenticationError('Invalid or expired access token');
    }
}
