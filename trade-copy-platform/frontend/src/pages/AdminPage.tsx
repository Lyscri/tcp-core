import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores';
import { Users, AlertTriangle, Power, BarChart3, Shield } from 'lucide-react';
import clsx from 'clsx';

export function AdminPage() {
    const { user } = useAuthStore();
    const queryClient = useQueryClient();

    const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

    const { data: users } = useQuery<any>({
        queryKey: ['admin', 'users'],
        queryFn: () => api.get('/admin/users'),
        enabled: isAdmin,
    });

    const { data: systemStatus } = useQuery<any>({
        queryKey: ['admin', 'system'],
        queryFn: () => api.get('/admin/system/status'),
        enabled: isAdmin,
        refetchInterval: 10_000,
    });

    const { data: volume } = useQuery<any[]>({
        queryKey: ['admin', 'volume'],
        queryFn: () => api.get('/admin/volume?days=7'),
        enabled: isAdmin,
    });

    const killSwitchMutation = useMutation({
        mutationFn: (activate: boolean) => api.post('/admin/system/global-kill-switch', { activate }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'system'] }),
    });

    const suspendMutation = useMutation({
        mutationFn: ({ id, suspended }: any) => api.put(`/admin/users/${id}/suspend`, { suspended }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    });

    if (!isAdmin) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <Shield size={48} className="text-surface-200/20 mx-auto mb-4" />
                    <p className="text-surface-200/40">Admin access required</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Admin Dashboard</h2>

            {/* System Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card">
                    <p className="stat-label">Global Kill Switch</p>
                    <div className="flex items-center gap-3 mt-2">
                        <button
                            onClick={() => killSwitchMutation.mutate(!systemStatus?.globalKillSwitch)}
                            className={clsx(
                                'flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all',
                                systemStatus?.globalKillSwitch
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            )}
                        >
                            <Power size={14} />
                            {systemStatus?.globalKillSwitch ? 'ACTIVE' : 'INACTIVE'}
                        </button>
                    </div>
                </div>
                <div className="glass-card">
                    <p className="stat-label">Trades Processed</p>
                    <p className="stat-value text-emerald-400 mt-1">{systemStatus?.tradesProcessed ?? 0}</p>
                </div>
                <div className="glass-card">
                    <p className="stat-label">Trades Failed</p>
                    <p className="stat-value text-red-400 mt-1">{systemStatus?.tradesFailed ?? 0}</p>
                </div>
            </div>

            {systemStatus?.globalKillSwitch && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl flex items-center gap-2">
                    <AlertTriangle size={16} />
                    <span className="text-sm font-medium">Global kill switch is active. All trading is halted.</span>
                </div>
            )}

            {/* Users */}
            <div className="glass-card">
                <div className="flex items-center gap-2 mb-4">
                    <Users size={18} className="text-brand-400" />
                    <h3 className="font-semibold">Users ({users?.meta?.total ?? 0})</h3>
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-surface-200/40 border-b border-surface-700/50">
                            <th className="text-left pb-3">Name</th>
                            <th className="text-left pb-3">Email</th>
                            <th className="text-left pb-3">Role</th>
                            <th className="text-left pb-3">Status</th>
                            <th className="text-right pb-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-700/30">
                        {(users?.data ?? []).map((u: any) => (
                            <tr key={u.id} className="hover:bg-surface-700/20">
                                <td className="py-3 text-white">{u.name}</td>
                                <td className="py-3 text-surface-200/60">{u.email}</td>
                                <td className="py-3"><span className="badge-blue">{u.role}</span></td>
                                <td className="py-3">
                                    <span className={u.suspended ? 'badge-red' : 'badge-green'}>
                                        {u.suspended ? 'Suspended' : 'Active'}
                                    </span>
                                </td>
                                <td className="py-3 text-right">
                                    <button
                                        onClick={() => suspendMutation.mutate({ id: u.id, suspended: !u.suspended })}
                                        className="text-xs text-surface-200/40 hover:text-white transition"
                                    >
                                        {u.suspended ? 'Unsuspend' : 'Suspend'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Volume */}
            {volume && volume.length > 0 && (
                <div className="glass-card">
                    <div className="flex items-center gap-2 mb-4">
                        <BarChart3 size={18} className="text-brand-400" />
                        <h3 className="font-semibold">Trading Volume (7 days)</h3>
                    </div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-surface-200/40 border-b border-surface-700/50">
                                <th className="text-left pb-3">Date</th>
                                <th className="text-right pb-3">Trades</th>
                                <th className="text-right pb-3">Volume</th>
                                <th className="text-right pb-3">P&L</th>
                                <th className="text-right pb-3">Active Users</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-700/30">
                            {volume.map((v: any) => (
                                <tr key={v.date}>
                                    <td className="py-3">{v.date}</td>
                                    <td className="py-3 text-right">{v.trade_count}</td>
                                    <td className="py-3 text-right font-mono">{parseFloat(v.total_volume).toFixed(2)}</td>
                                    <td className={clsx('py-3 text-right font-mono', parseFloat(v.total_pnl) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                                        ${parseFloat(v.total_pnl).toFixed(2)}
                                    </td>
                                    <td className="py-3 text-right">{v.active_users}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
