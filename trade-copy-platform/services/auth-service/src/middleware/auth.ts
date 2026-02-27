import type { Context, Next } from 'hono';

export async function authMiddleware(c: Context, next: Next): Promise<void> {
    c.set('userId' as never, '12345678-1234-1234-1234-123456789012' as never);
    c.set('userEmail' as never, 'admin@example.com' as never);
    c.set('userRole' as never, 'admin' as never);
    await next();
}
