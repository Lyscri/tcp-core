import type { Context } from 'hono';
import { createServiceLogger } from '@tcp/shared-utils';

const log = createServiceLogger('proxy');

export async function proxyRequest(
    c: Context,
    targetBaseUrl: string,
    targetPath: string,
    userId?: string,
    userRole?: string
): Promise<Response> {
    const url = `${targetBaseUrl}${targetPath}`;
    const method = c.req.method;

    const headers: Record<string, string> = {
        'Content-Type': c.req.header('content-type') ?? 'application/json',
        'X-Request-Id': c.req.header('x-request-id') ?? '',
    };

    if (userId) headers['x-user-id'] = userId;
    if (userRole) headers['x-user-role'] = userRole;

    // Forward authorization header
    const auth = c.req.header('authorization');
    if (auth) headers['Authorization'] = auth;

    try {
        const init: RequestInit = {
            method,
            headers,
            signal: AbortSignal.timeout(30_000),
        };

        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            const body = await c.req.text();
            if (body) init.body = body;
        }

        const response = await fetch(url, init);
        const responseBody = await response.text();

        return new Response(responseBody, {
            status: response.status,
            headers: {
                'Content-Type': response.headers.get('content-type') ?? 'application/json',
            },
        });
    } catch (error) {
        log.error({ error, url, method }, 'Proxy request failed');
        return c.json(
            { success: false, error: { code: 'GATEWAY_ERROR', message: 'Service unavailable' } },
            502
        );
    }
}
