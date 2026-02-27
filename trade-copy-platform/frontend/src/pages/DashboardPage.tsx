import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { TrendingUp, TrendingDown, Users, Clock, DollarSign, Activity } from 'lucide-react';
import clsx from 'clsx';

interface OverviewData {
    dailyPnl: number;
    monthlyPnl: number;
    avgLatencyMs: number;
}

export function DashboardPage() {
    const { data: overview } = useQuery<OverviewData>({
        queryKey: ['analytics', 'overview'],
        queryFn: () => api.get('/analytics/overview'),
        placeholderData: { dailyPnl: 0, monthlyPnl: 0, avgLatencyMs: 0 },
    });

    const { data: accounts } = useQuery<any[]>({
        queryKey: ['accounts'],
        queryFn: () => api.get('/accounts/'),
        placeholderData: [],
    });

    const stats = [
        {
            label: 'Total Balance',
            value: `$${(accounts?.reduce((sum: number, a: any) => sum + (a.balance ?? 0), 0) ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            icon: DollarSign,
            color: 'text-brand-400',
            bg: 'bg-brand-500/10',
        },
        {
            label: 'Daily P&L',
            value: `${(overview?.dailyPnl ?? 0) >= 0 ? '+' : ''}$${(overview?.dailyPnl ?? 0).toFixed(2)}`,
            icon: (overview?.dailyPnl ?? 0) >= 0 ? TrendingUp : TrendingDown,
            color: (overview?.dailyPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
            bg: (overview?.dailyPnl ?? 0) >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10',
        },
        {
            label: 'Monthly P&L',
            value: `${(overview?.monthlyPnl ?? 0) >= 0 ? '+' : ''}$${(overview?.monthlyPnl ?? 0).toFixed(2)}`,
            icon: (overview?.monthlyPnl ?? 0) >= 0 ? TrendingUp : TrendingDown,
            color: (overview?.monthlyPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
            bg: (overview?.monthlyPnl ?? 0) >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10',
        },
        {
            label: 'Connected Accounts',
            value: String(accounts?.length ?? 0),
            icon: Users,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
        },
        {
            label: 'Avg Latency',
            value: `${(overview?.avgLatencyMs ?? 0).toFixed(0)}ms`,
            icon: Clock,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
        },
        {
            label: 'System Status',
            value: 'Operational',
            icon: Activity,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
        },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-white mb-1">Dashboard</h2>
                <p className="text-surface-200/50 text-sm">Overview of your trading performance</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats.map((stat) => (
                    <div key={stat.label} className="glass-card flex items-start justify-between">
                        <div>
                            <p className="stat-label">{stat.label}</p>
                            <p className={clsx('stat-value mt-1', stat.color)}>{stat.value}</p>
                        </div>
                        <div className={clsx('p-3 rounded-xl', stat.bg)}>
                            <stat.icon size={22} className={stat.color} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Accounts Table */}
            <div className="glass-card">
                <h3 className="text-lg font-semibold mb-4">Connected Accounts</h3>
                {accounts && accounts.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-surface-200/40 border-b border-surface-700/50">
                                    <th className="text-left pb-3 font-medium">Label</th>
                                    <th className="text-left pb-3 font-medium">Broker</th>
                                    <th className="text-left pb-3 font-medium">Status</th>
                                    <th className="text-right pb-3 font-medium">Balance</th>
                                    <th className="text-right pb-3 font-medium">Equity</th>
                                    <th className="text-left pb-3 font-medium">Role</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-700/30">
                                {accounts.map((account: any) => (
                                    <tr key={account.id} className="hover:bg-surface-700/20 transition-colors">
                                        <td className="py-3 font-medium text-white">{account.label}</td>
                                        <td className="py-3"><span className="badge-blue">{account.brokerType}</span></td>
                                        <td className="py-3">
                                            <span className={account.status === 'ACTIVE' ? 'badge-green' : account.status === 'ERROR' ? 'badge-red' : 'badge-yellow'}>{account.status}</span>
                                        </td>
                                        <td className="py-3 text-right font-mono">${parseFloat(account.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="py-3 text-right font-mono">${parseFloat(account.equity).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="py-3">{account.isLeader ? <span className="badge-green">Leader</span> : <span className="text-surface-200/40">Follower</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-surface-200/40 text-sm">No accounts connected yet. Go to Accounts to add one.</p>
                )}
            </div>
        </div>
    );
}
