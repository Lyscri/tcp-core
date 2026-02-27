import type { Context, Next } from 'hono';
import { AuthenticationError, AuthorizationError, createServiceLogger } from '@tcp/shared-utils';
import jwt from 'jsonwebtoken';

const log = createServiceLogger('gateway-auth');
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production-min32chars!!';

export async function authMiddleware(c: Context, next: Next): Promise<void> {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        throw new AuthenticationError('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    try {
        const payload = jwt.verify(token, JWT_SECRET) as { sub: string; email: string; role: string };
        c.set('userId' as never, payload.sub as never);
        c.set('userEmail' as never, payload.email as never);
        c.set('userRole' as never, payload.role as never);
        await next();
    } catch {
        throw new AuthenticationError('Invalid or expired access token');
    }
}

export function requireRole(...roles: string[]) {
    return async (c: Context, next: Next): Promise<void> => {
        const userRole = c.get('userRole' as never) as string;
        if (!roles.includes(userRole)) {
            throw new AuthorizationError(`Requires one of roles: ${roles.join(', ')}`);
        }
        await next();
    };
}
