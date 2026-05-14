import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Plus, Trash2, Power, Link2, RefreshCw } from 'lucide-react';

export function SyncConfigPage() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ leaderAccountId: '', followerAccountId: '', copyMode: 'PROPORTIONAL', multiplier: 1, maxLotSize: 100, invertTrades: false });
    const leaderAccountSelectRef = useRef<HTMLSelectElement>(null);
    const followerAccountSelectRef = useRef<HTMLSelectElement>(null);
    const formRef = useRef<HTMLFormElement>(null);

    // Focus leader account select when form opens
    useEffect(() => {
        if (showForm) {
            if (leaderAccountSelectRef.current) {
                leaderAccountSelectRef.current.focus();
            } else if (followerAccountSelectRef.current) {
                followerAccountSelectRef.current.focus();
            }
        }
    }, [showForm]);

    const { data: configs = [] } = useQuery<any[]>({ queryKey: ['sync-configs'], queryFn: () => api.get('/accounts/sync-configs') });
    const { data: accounts = [] } = useQuery<any[]>({ queryKey: ['accounts'], queryFn: () => api.get('/accounts/') });

    const createMutation = useMutation({
        mutationFn: (data: any) => api.post('/accounts/sync-configs', data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sync-configs'] }); setShowForm(false); },
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, enabled }: any) => api.put(`/accounts/sync-configs/${id}/toggle`, { enabled }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sync-configs'] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/accounts/sync-configs/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sync-configs'] }),
    });

    const getLabel = (id: string) => accounts.find((a: any) => a.id === id)?.label ?? id;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Sync Configuration</h2>
                    <p className="text-surface-200/50 text-sm mt-1">Configure trade copying between leader and follower accounts</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2"><Plus size={18} /><span>New Config</span></button>
                    <button onClick={() => {
                        // Trigger refetch of queries
                        const queryClient = useQueryClient();
                        queryClient.invalidateQueries({ queryKey: ['sync-configs'] });
                        queryClient.invalidateQueries({ queryKey: ['accounts'] });
                    }} className="btn-secondary flex items-center gap-2">
                        <RefreshCw size={16} /><span>Refresh Data</span>
                    </button>
                </div>
            </div>

            {showForm && (
                <div className="glass-card animate-slide-up">
                    <h3 className="font-semibold mb-4">Create Sync Configuration</h3>
                    <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                             <label className="text-sm text-surface-200/60 mb-1.5 block">Leader Account</label>
                             <select ref={leaderAccountSelectRef} value={form.leaderAccountId} onChange={(e) => setForm((f) => ({ ...f, leaderAccountId: e.target.value }))} className="input w-full" required>
                                 <option value="">Select leader...</option>
                                 {accounts.filter((a: any) => a.isLeader).map((a: any) => <option key={a.id} value={a.id}>{a.label}</option>)}
                             </select>
                         </div>
                         <div>
                             <label className="text-sm text-surface-200/60 mb-1.5 block">Follower Account</label>
                             <select ref={followerAccountSelectRef} value={form.followerAccountId} onChange={(e) => setForm((f) => ({ ...f, followerAccountId: e.target.value }))} className="input w-full" required>
                                 <option value="">Select follower...</option>
                                 {accounts.filter((a: any) => !a.isLeader).map((a: any) => <option key={a.id} value={a.id}>{a.label}</option>)}
                             </select>
                         </div>
                        <div>
                            <label className="text-sm text-surface-200/60 mb-1.5 block">Copy Mode</label>
                            <select value={form.copyMode} onChange={(e) => setForm((f) => ({ ...f, copyMode: e.target.value }))} className="input w-full">
                                <option value="FIXED">Fixed Lot</option>
                                <option value="PROPORTIONAL">Proportional</option>
                                <option value="MULTIPLIER">Multiplier</option>
                                <option value="RISK_BASED">Risk Based</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-sm text-surface-200/60 mb-1.5 block">Multiplier</label>
                            <input type="number" step="0.01" value={form.multiplier} onChange={(e) => setForm((f) => ({ ...f, multiplier: parseFloat(e.target.value) }))} className="input w-full" />
                        </div>
                        <div>
                            <label className="text-sm text-surface-200/60 mb-1.5 block">Max Lot Size</label>
                            <input type="number" step="0.01" value={form.maxLotSize} onChange={(e) => setForm((f) => ({ ...f, maxLotSize: parseFloat(e.target.value) }))} className="input w-full" />
                        </div>
                        <div className="flex items-center gap-3 pt-6">
                            <input type="checkbox" checked={form.invertTrades} onChange={(e) => setForm((f) => ({ ...f, invertTrades: e.target.checked }))} className="w-4 h-4 rounded" id="invert" />
                            <label htmlFor="invert" className="text-sm text-surface-200/70">Invert Trades</label>
                        </div>
                        <div className="md:col-span-2 flex gap-3">
                            <button type="submit" disabled={createMutation.isPending} className="btn-primary">{createMutation.isPending ? 'Creating...' : 'Create Config'}</button>
                            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="space-y-3">
                {configs.map((config: any) => (
                    <div key={config.id} className="glass-card flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center"><Link2 size={18} className="text-brand-400" /></div>
                            <div>
                                <p className="font-semibold text-white">{getLabel(config.leaderAccountId)} → {getLabel(config.followerAccountId)}</p>
                                <p className="text-xs text-surface-200/40">{config.copyMode} • Multiplier: {config.multiplier}x • Max: {config.maxLotSize} lots{config.invertTrades ? ' • Inverted' : ''}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={config.enabled ? 'badge-green' : 'badge-red'}>{config.enabled ? 'Active' : 'Disabled'}</span>
                            <button onClick={() => toggleMutation.mutate({ id: config.id, enabled: !config.enabled })} className="p-2 rounded-lg hover:bg-brand-500/10 text-surface-200/40 hover:text-brand-400 transition"><Power size={16} /></button>
                            <button onClick={() => deleteMutation.mutate(config.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-surface-200/40 hover:text-red-400 transition"><Trash2 size={16} /></button>
                        </div>
                    </div>
                ))}
                {configs.length === 0 && <p className="text-center text-surface-200/40 py-12">No sync configurations. Create one to start copying trades.</p>}
            </div>
        </div>
    );
}
