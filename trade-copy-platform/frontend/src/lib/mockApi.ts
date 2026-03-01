let mockData = {
    accounts: [
        { id: '1', label: 'Primary Trading Account', brokerType: 'MT4', accountId: '10001', status: 'ACTIVE', isLeader: true, balance: 15400.50, equity: 15450.75, currency: 'USD' },
        { id: '2', label: 'Secondary Risk Account', brokerType: 'CTRADER', accountId: '10002', status: 'ACTIVE', isLeader: false, balance: 5000.00, equity: 4800.00, currency: 'USD' },
    ],
    analytics: {
        overview: {
            totalAccounts: 2,
            totalBalance: 20400.50,
            activeSyncs: 1,
            dailyPnL: 150.25,
            winRate: 68.5,
            totalTrades: 142,
        },
        dailyPnL: Array.from({ length: 30 }).map((_, i) => ({
            trade_date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0],
            total_pnl: (Math.random() * 500 - 150).toFixed(2),
            trade_count: Math.floor(Math.random() * 20) + 1,
        })),
        symbols: [
            { symbol: 'EURUSD', trade_count: 45, total_pnl: 350.50, wins: 30 },
            { symbol: 'GBPUSD', trade_count: 30, total_pnl: -120.00, wins: 12 },
            { symbol: 'XAUUSD', trade_count: 67, total_pnl: 890.20, wins: 50 },
        ]
    },
    payments: {
        subscription: { plan: 'FREE', status: 'ACTIVE' },
        plans: [
            { id: 'FREE', name: 'Free', price: 0, features: ['1 account', 'Basic analytics'] },
            { id: 'STARTER', name: 'Starter', price: 29, features: ['3 accounts', 'Trade copying', 'Daily analytics'] },
            { id: 'PROFESSIONAL', name: 'Professional', price: 79, features: ['10 accounts', 'Advanced risk controls', 'Real-time analytics', 'Priority support'] },
            { id: 'ENTERPRISE', name: 'Enterprise', price: 199, features: ['Unlimited accounts', 'Custom adapters', 'Dedicated support', 'SLA'] },
        ],
        invoices: [
            { id: 'inv_1', date: Date.now() / 1000 - 86400 * 5, amount: 2900, status: 'paid', pdfUrl: '#' },
        ]
    },
    syncConfigs: [
        { id: '1', leaderId: '1', followerId: '2', copyMode: 'PROPORTIONAL', multiplier: 0.5, enabled: true },
    ],
    riskConfigs: [
        { id: '1', accountId: '1', maxDrawdown: 10, maxExposure: 50 },
    ],
    auth: {
        users: [
            { id: 'admin1', name: 'Admin User', email: 'admin@trade.com', role: 'ADMIN' },
            { id: 'user1', name: 'Normal Trader', email: 'user@trade.com', role: 'USER' }
        ],
        currentUser: null as any,
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
    }
};

export async function handleMockRequest(path: string, options: RequestInit) {
    // Artificial delay
    await new Promise((resolve) => setTimeout(resolve, 400));
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body as string) : {};

    // Auth
    if (path === '/auth/login') {
        const isUser = body.email && body.email.toLowerCase().includes('user');
        mockData.auth.currentUser = isUser ? mockData.auth.users[1] : mockData.auth.users[0];
        return { success: true, data: { ...mockData.auth, user: mockData.auth.currentUser } };
    }
    if (path === '/auth/register') {
        mockData.auth.currentUser = mockData.auth.users[1];
        return { success: true, data: { ...mockData.auth, user: mockData.auth.currentUser } };
    }
    if (path === '/auth/refresh') {
        return { success: true, data: { accessToken: 'new-mock-access-token', refreshToken: 'new-mock-refresh-token' } };
    }
    if (path === '/auth/me') {
        return { success: true, data: { user: mockData.auth.currentUser || mockData.auth.users[0] } };
    }

    // Sync Configs
    if (path === '/accounts/sync-configs' || path === '/accounts/sync-configs/') {
        if (method === 'GET') return { success: true, data: mockData.syncConfigs };
        if (method === 'POST') {
            const newSyncConfig = { id: Date.now().toString(), enabled: true, ...body };
            mockData.syncConfigs.push(newSyncConfig);
            return { success: true, data: newSyncConfig };
        }
    }
    const syncConfigMatch = path.match(/^\/accounts\/sync-configs\/(\w+)(?:\/(toggle))?$/);
    if (syncConfigMatch) {
        const [, id, action] = syncConfigMatch;
        const index = mockData.syncConfigs.findIndex(s => s.id === id);
        if (method === 'DELETE' && index >= 0) {
            mockData.syncConfigs.splice(index, 1);
            return { success: true, data: { deleted: true } };
        }
        if (method === 'PUT' && index >= 0) {
            if (action === 'toggle') {
                mockData.syncConfigs[index].enabled = body.enabled;
            } else {
                mockData.syncConfigs[index] = { ...mockData.syncConfigs[index], ...body };
            }
            return { success: true, data: mockData.syncConfigs[index] };
        }
    }

    // Accounts
    if (path === '/accounts/' || path === '/accounts') {
        if (method === 'GET') return { success: true, data: mockData.accounts };
        if (method === 'POST') {
            const newAcc = {
                id: Date.now().toString(),
                ...body,
                status: 'PENDING',
                isLeader: false,
                balance: 0,
                equity: 0,
                currency: 'USD'
            };
            mockData.accounts.push(newAcc);
            mockData.analytics.overview.totalAccounts++;
            return { success: true, data: newAcc };
        }
    }

    // Account details / mutations
    const accountMatch = path.match(/^\/accounts\/(\w+)(?:\/(toggle|leader))?$/);
    if (accountMatch) {
        const [, id, action] = accountMatch;
        const index = mockData.accounts.findIndex(a => a.id === id);
        if (method === 'DELETE' && index >= 0) {
            mockData.accounts.splice(index, 1);
            mockData.analytics.overview.totalAccounts--;
            return { success: true, data: { deleted: true } };
        }
        if (method === 'PUT' && index >= 0) {
            if (action === 'toggle') {
                mockData.accounts[index].status = body.enabled ? 'ACTIVE' : 'DISABLED';
            } else if (action === 'leader') {
                mockData.accounts[index].isLeader = body.isLeader;
            } else {
                mockData.accounts[index] = { ...mockData.accounts[index], ...body };
            }
            return { success: true, data: mockData.accounts[index] };
        }
    }

    // Analytics
    if (path === '/analytics/overview') return { success: true, data: mockData.analytics.overview };
    if (path.startsWith('/analytics/pnl/daily')) return { success: true, data: mockData.analytics.dailyPnL };
    if (path === '/analytics/symbols') return { success: true, data: mockData.analytics.symbols };

    // Payments
    if (path === '/payments/subscription') return { success: true, data: mockData.payments.subscription };
    if (path === '/payments/plans') return { success: true, data: mockData.payments.plans };
    if (path === '/payments/invoices') return { success: true, data: mockData.payments.invoices };
    if (path === '/payments/subscribe' && method === 'POST') {
        mockData.payments.subscription = { plan: body.plan || 'STARTER', status: 'ACTIVE' };
        mockData.payments.invoices.push({
            id: 'inv_' + Date.now(),
            date: Date.now() / 1000,
            amount: mockData.payments.plans.find(p => p.id === body.plan)?.price ? mockData.payments.plans.find(p => p.id === body.plan)!.price * 100 : 0,
            status: 'paid',
            pdfUrl: '#'
        });
        // We simulate that the upgrade happened without redirecting for the mock demo
        return { success: true, data: { sessionUrl: null } };
    }
    if (path === '/payments/cancel' && method === 'POST') {
        mockData.payments.subscription = { plan: 'FREE', status: 'ACTIVE' };
        return { success: true, data: { cancelled: true } };
    }

    // Fallback for success formats
    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        return { success: true, data: { status: 'mock-success' } };
    }

    return { success: true, data: [] };
}

