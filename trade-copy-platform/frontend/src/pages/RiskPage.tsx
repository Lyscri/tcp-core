import { useQuery, useMutation, useQueryClient, useRef } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Shield, AlertTriangle, Power, RefreshCw } from 'lucide-react';

export function RiskPage() {
    const queryClient = useQueryClient();
    const { data: accounts = [] } = useQuery<any[]>({ queryKey: ['accounts'], queryFn: () => api.get('/accounts/') });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Risk Control Panel</h2>
                    <p className="text-surface-200/50 text-sm mt-1">Configure risk limits and kill switches per account</p>
                </div>
                <button onClick={() => {
                    // Trigger refetch of queries
                    const queryClient = useQueryClient();
                    queryClient.invalidateQueries({ queryKey: ['accounts'] });
                    // Also invalidate all risk queries
                    accounts.forEach((account: any) => {
                        queryClient.invalidateQueries({ queryKey: ['risk', account.id] });
                    });
                }} className="btn-secondary flex items-center gap-2">
                    <RefreshCw size={16} /><span>Refresh All</span>
                </button>
            </div>

            {accounts.length === 0 && <p className="text-center text-surface-200/40 py-12">No accounts to configure risk for.</p>}

            {accounts.map((account: any) => (
                <RiskCard key={account.id} account={account} queryClient={queryClient} />
            ))}
        </div>
    );
}

function RiskCard({ account, queryClient }: { account: any; queryClient: any }) {
    const { data: riskConfig } = useQuery({
        queryKey: ['risk', account.id],
        queryFn: () => api.get(`/accounts/${account.id}/risk`),
    });

    const updateMutation = useMutation({
        mutationFn: (data: any) => api.put(`/accounts/${account.id}/risk`, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['risk', account.id] }),
    });

    const config = (riskConfig ?? {}) as any;

    return (
        <div className="glass-card">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <Shield size={20} className="text-brand-400" />
                    <h3 className="font-semibold text-white">{account.label}</h3>
                    <span className="badge-blue">{account.brokerType}</span>
                </div>
                <button
                    onClick={() => updateMutation.mutate({ killSwitchActive: !config.killSwitchActive })}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${config.killSwitchActive ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-surface-700/50 text-surface-200/60 border border-surface-700'
                        }`}
                >
                    <Power size={14} />
                    {config.killSwitchActive ? 'Kill Switch ON' : 'Kill Switch OFF'}
                </button>
            </div>

            {config.killSwitchActive && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm mb-4 flex items-center gap-2">
                    <AlertTriangle size={16} />
                    <span>Kill switch is active. All trades are blocked for this account.</span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                    <label className="text-sm text-surface-200/60 mb-1.5 block">Daily Loss Limit ($)</label>
                    <input
                        type="number"
                        defaultValue={config.dailyLossLimit ?? 0}
                        onBlur={(e) => updateMutation.mutate({ dailyLossLimit: parseFloat(e.target.value) })}
                        className="input w-full"
                    />
                </div>
                <div>
                    <label className="text-sm text-surface-200/60 mb-1.5 block">Trade Loss Limit ($)</label>
                    <input
                        type="number"
                        defaultValue={config.tradeLossLimit ?? 0}
                        onBlur={(e) => updateMutation.mutate({ tradeLossLimit: parseFloat(e.target.value) })}
                        className="input w-full"
                    />
                </div>
                <div>
                    <label className="text-sm text-surface-200/60 mb-1.5 block">Max Open Trades</label>
                    <input
                        type="number"
                        defaultValue={config.maxOpenTrades ?? 50}
                        onBlur={(e) => updateMutation.mutate({ maxOpenTrades: parseInt(e.target.value) })}
                        className="input w-full"
                    />
                </div>
                <div>
                    <label className="text-sm text-surface-200/60 mb-1.5 block">Max Lot Size</label>
                    <input
                        type="number"
                        step="0.01"
                        defaultValue={config.maxLotSize ?? 100}
                        onBlur={(e) => updateMutation.mutate({ maxLotSize: parseFloat(e.target.value) })}
                        className="input w-full"
                    />
                </div>
            </div>
        </div>
    );
}
