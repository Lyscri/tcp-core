import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { BarChart3, Download } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import clsx from 'clsx';

export function AnalyticsPage() {
    const { data: dailyPnl = [] } = useQuery<any[]>({
        queryKey: ['analytics', 'pnl', 'daily'],
        queryFn: () => api.get('/analytics/pnl/daily?days=30'),
    });

    const { data: symbolPerf = [] } = useQuery<any[]>({
        queryKey: ['analytics', 'symbols'],
        queryFn: () => api.get('/analytics/symbols'),
    });

    const handleExport = async () => {
        const { useAuthStore } = await import('../stores');
        const response = await fetch('/api/analytics/export/csv', {
            headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken}` },
        });
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `trades_${Date.now()}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const chartData = dailyPnl.map((d: any) => ({
        date: d.trade_date,
        pnl: parseFloat(d.total_pnl ?? 0),
        trades: parseInt(d.trade_count ?? 0),
    })).reverse();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Analytics</h2>
                    <p className="text-surface-200/50 text-sm mt-1">Performance metrics and trade analysis</p>
                </div>
                <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
                    <Download size={16} /><span>Export CSV</span>
                </button>
            </div>

            <div className="glass-card">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <BarChart3 size={18} className="text-brand-400" />Daily P&L (30 days)
                </h3>
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#5c64f4" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#5c64f4" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 11 }} />
                            <YAxis stroke="#475569" tick={{ fontSize: 11 }} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, color: 'white' }} />
                            <Area type="monotone" dataKey="pnl" stroke="#5c64f4" fill="url(#pnlGrad)" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="glass-card">
                <h3 className="font-semibold mb-4">Daily Trade Count</h3>
                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 11 }} />
                            <YAxis stroke="#475569" tick={{ fontSize: 11 }} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, color: 'white' }} />
                            <Bar dataKey="trades" fill="#5c64f4" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="glass-card">
                <h3 className="font-semibold mb-4">Symbol Performance</h3>
                {symbolPerf.length > 0 ? (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-surface-200/40 border-b border-surface-700/50">
                                <th className="text-left pb-3">Symbol</th>
                                <th className="text-right pb-3">Trades</th>
                                <th className="text-right pb-3">P&L</th>
                                <th className="text-right pb-3">Win Rate</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-700/30">
                            {symbolPerf.map((s: any) => (
                                <tr key={s.symbol} className="hover:bg-surface-700/20">
                                    <td className="py-3 font-mono text-white">{s.symbol}</td>
                                    <td className="py-3 text-right">{s.trade_count}</td>
                                    <td className={clsx('py-3 text-right font-mono', parseFloat(s.total_pnl) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                                        ${parseFloat(s.total_pnl).toFixed(2)}
                                    </td>
                                    <td className="py-3 text-right">
                                        {s.trade_count > 0 ? ((s.wins / s.trade_count) * 100).toFixed(1) : '0'}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="text-surface-200/40 text-sm text-center py-8">No data yet</p>
                )}
            </div>
        </div>
    );
}
