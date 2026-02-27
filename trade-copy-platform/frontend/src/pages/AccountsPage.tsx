import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Plus, Trash2, Power, Crown } from 'lucide-react';

export function AccountsPage() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ brokerType: 'SIMULATED', accountId: '', label: '', credentials: '{}' });

    const { data: accounts = [] } = useQuery<any[]>({ queryKey: ['accounts'], queryFn: () => api.get('/accounts/') });

    const createMutation = useMutation({
        mutationFn: (data: any) => api.post('/accounts/', data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounts'] }); setShowForm(false); setForm({ brokerType: 'SIMULATED', accountId: '', label: '', credentials: '{}' }); },
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.put(`/accounts/${id}/toggle`, { enabled }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
    });

    const leaderMutation = useMutation({
        mutationFn: ({ id, isLeader }: { id: string; isLeader: boolean }) => api.put(`/accounts/${id}/leader`, { isLeader }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/accounts/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Account Management</h2>
                    <p className="text-surface-200/50 text-sm mt-1">Connect and manage your broker accounts</p>
                </div>
                <button id="add-account-btn" onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
                    <Plus size={18} /><span>Add Account</span>
                </button>
            </div>

            {showForm && (
                <div className="glass-card animate-slide-up">
                    <h3 className="font-semibold mb-4">Connect New Broker Account</h3>
                    <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate({ ...form, credentials: JSON.parse(form.credentials || '{}') }); }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm text-surface-200/60 mb-1.5 block">Broker Type</label>
                            <select value={form.brokerType} onChange={(e) => setForm((f) => ({ ...f, brokerType: e.target.value }))} className="input w-full">
                                <option value="SIMULATED">Simulated</option>
                                <option value="MT4">MetaTrader 4</option>
                                <option value="MT5">MetaTrader 5</option>
                                <option value="CTRADER">cTrader</option>
                                <option value="FIX">FIX Protocol</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-sm text-surface-200/60 mb-1.5 block">Account ID</label>
                            <input value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))} className="input w-full" placeholder="e.g. 12345678" required />
                        </div>
                        <div>
                            <label className="text-sm text-surface-200/60 mb-1.5 block">Label</label>
                            <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} className="input w-full" placeholder="My Trading Account" required />
                        </div>
                        <div>
                            <label className="text-sm text-surface-200/60 mb-1.5 block">Credentials (JSON)</label>
                            <input value={form.credentials} onChange={(e) => setForm((f) => ({ ...f, credentials: e.target.value }))} className="input w-full font-mono text-xs" placeholder='{"apiKey": "..."}' />
                        </div>
                        <div className="md:col-span-2 flex gap-3">
                            <button type="submit" disabled={createMutation.isPending} className="btn-primary">{createMutation.isPending ? 'Connecting...' : 'Connect Account'}</button>
                            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="space-y-3">
                {accounts.map((account: any) => (
                    <div key={account.id} className="glass-card flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center">
                                <span className="text-brand-400 font-mono text-xs font-bold">{account.brokerType.slice(0, 3)}</span>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="font-semibold text-white">{account.label}</h4>
                                    {account.isLeader && <Crown size={14} className="text-amber-400" />}
                                    <span className={account.status === 'ACTIVE' ? 'badge-green' : 'badge-yellow'}>{account.status}</span>
                                </div>
                                <p className="text-xs text-surface-200/40 mt-0.5">{account.brokerType} • {account.accountId}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <p className="text-sm font-mono text-white">${parseFloat(account.balance).toFixed(2)}</p>
                                <p className="text-xs text-surface-200/40">Balance</p>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={() => leaderMutation.mutate({ id: account.id, isLeader: !account.isLeader })} className="p-2 rounded-lg hover:bg-amber-500/10 text-surface-200/40 hover:text-amber-400 transition-colors" title={account.isLeader ? 'Remove Leader' : 'Set Leader'}>
                                    <Crown size={16} />
                                </button>
                                <button onClick={() => toggleMutation.mutate({ id: account.id, enabled: account.status !== 'ACTIVE' })} className="p-2 rounded-lg hover:bg-brand-500/10 text-surface-200/40 hover:text-brand-400 transition-colors" title="Toggle">
                                    <Power size={16} />
                                </button>
                                <button onClick={() => deleteMutation.mutate(account.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-surface-200/40 hover:text-red-400 transition-colors" title="Delete">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                {accounts.length === 0 && <p className="text-center text-surface-200/40 py-12">No accounts connected. Click "Add Account" to get started.</p>}
            </div>
        </div>
    );
}
