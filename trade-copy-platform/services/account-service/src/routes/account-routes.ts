import { Hono } from 'hono';
import type { AccountService } from '../domain/account-service.js';
import { createAccountSchema, createSyncConfigSchema, updateRiskConfigSchema, ValidationError } from '@tcp/shared-utils';

export function createAccountRoutes(accountService: AccountService): Hono {
    const r = new Hono();

    // ── Broker Accounts ────────────────────────────────────────
    r.get('/', async (c) => {
        const userId = c.req.header('x-user-id') ?? '';
        const accounts = await accountService.getUserAccounts(userId);
        return c.json({ success: true, data: accounts });
    });

    r.post('/', async (c) => {
        const userId = c.req.header('x-user-id') ?? '';
        const body = await c.req.json();
        const parsed = createAccountSchema.safeParse(body);
        if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten());
        const account = await accountService.createAccount(userId, parsed.data);
        return c.json({ success: true, data: account }, 201);
    });

    r.get('/:id', async (c) => {
        const userId = c.req.header('x-user-id') ?? '';
        const account = await accountService.getAccount(userId, c.req.param('id'));
        return c.json({ success: true, data: account });
    });

    r.put('/:id/toggle', async (c) => {
        const userId = c.req.header('x-user-id') ?? '';
        const { enabled } = await c.req.json();
        await accountService.toggleAccount(userId, c.req.param('id'), enabled);
        return c.json({ success: true });
    });

    r.put('/:id/leader', async (c) => {
        const userId = c.req.header('x-user-id') ?? '';
        const { isLeader } = await c.req.json();
        await accountService.setLeader(userId, c.req.param('id'), isLeader);
        return c.json({ success: true });
    });

    r.delete('/:id', async (c) => {
        const userId = c.req.header('x-user-id') ?? '';
        await accountService.deleteAccount(userId, c.req.param('id'));
        return c.json({ success: true });
    });

    // ── Sync Configs ───────────────────────────────────────────
    r.get('/sync-configs', async (c) => {
        const userId = c.req.header('x-user-id') ?? '';
        const configs = await accountService.getUserSyncConfigs(userId);
        return c.json({ success: true, data: configs });
    });

    r.post('/sync-configs', async (c) => {
        const userId = c.req.header('x-user-id') ?? '';
        const body = await c.req.json();
        const parsed = createSyncConfigSchema.safeParse(body);
        if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten());
        const config = await accountService.createSyncConfig(userId, parsed.data);
        return c.json({ success: true, data: config }, 201);
    });

    r.put('/sync-configs/:id/toggle', async (c) => {
        const userId = c.req.header('x-user-id') ?? '';
        const { enabled } = await c.req.json();
        await accountService.toggleSyncConfig(userId, c.req.param('id'), enabled);
        return c.json({ success: true });
    });

    r.delete('/sync-configs/:id', async (c) => {
        const userId = c.req.header('x-user-id') ?? '';
        await accountService.deleteSyncConfig(userId, c.req.param('id'));
        return c.json({ success: true });
    });

    // ── Risk Configs ───────────────────────────────────────────
    r.get('/:id/risk', async (c) => {
        const userId = c.req.header('x-user-id') ?? '';
        const config = await accountService.getRiskConfig(userId, c.req.param('id'));
        return c.json({ success: true, data: config });
    });

    r.put('/:id/risk', async (c) => {
        const userId = c.req.header('x-user-id') ?? '';
        const body = await c.req.json();
        const parsed = updateRiskConfigSchema.safeParse(body);
        if (!parsed.success) throw new ValidationError('Validation failed', parsed.error.flatten());
        const config = await accountService.updateRiskConfig(userId, c.req.param('id'), parsed.data);
        return c.json({ success: true, data: config });
    });

    // ── Internal: sync configs by leader (for trade-sync-engine) ─
    r.get('/internal/sync-configs/leader/:leaderAccountId', async (c) => {
        const configs = await accountService.getSyncConfigsForLeader(c.req.param('leaderAccountId'));
        return c.json({ success: true, data: configs });
    });

    return r;
}
