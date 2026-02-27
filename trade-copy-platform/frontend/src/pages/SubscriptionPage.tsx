import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { CreditCard, Check, Zap, Star, Building2 } from 'lucide-react';
import clsx from 'clsx';

const planIcons: Record<string, any> = { FREE: Zap, STARTER: Star, PROFESSIONAL: CreditCard, ENTERPRISE: Building2 };

export function SubscriptionPage() {
    const { data: subscription } = useQuery<any>({
        queryKey: ['subscription'],
        queryFn: () => api.get('/payments/subscription'),
    });

    const { data: plans = [] } = useQuery<any[]>({
        queryKey: ['plans'],
        queryFn: () => api.get('/payments/plans'),
    });

    const { data: invoices = [] } = useQuery<any[]>({
        queryKey: ['invoices'],
        queryFn: () => api.get('/payments/invoices'),
    });

    const subscribeMutation = useMutation({
        mutationFn: (plan: string) => api.post<{ sessionUrl: string }>('/payments/subscribe', { plan }),
        onSuccess: (data) => { if (data.sessionUrl) window.location.href = data.sessionUrl; },
    });

    const cancelMutation = useMutation({
        mutationFn: () => api.post('/payments/cancel'),
    });

    const currentPlan = subscription?.plan ?? 'FREE';

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Subscription</h2>
                <p className="text-surface-200/50 text-sm mt-1">Manage your plan and billing</p>
            </div>

            <div className="glass-card">
                <p className="text-sm text-surface-200/60">Current Plan</p>
                <p className="text-xl font-bold text-brand-400 mt-1">{currentPlan}</p>
                <p className="text-xs text-surface-200/40 mt-1">Status: {subscription?.status ?? 'ACTIVE'}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {plans.map((plan: any) => {
                    const Icon = planIcons[plan.id] ?? Zap;
                    const isCurrent = plan.id === currentPlan;
                    return (
                        <div key={plan.id} className={clsx(
                            'glass-card relative',
                            isCurrent && 'border-brand-500/50 shadow-lg shadow-brand-500/10'
                        )}>
                            {isCurrent && <div className="absolute -top-3 left-1/2 -translate-x-1/2 badge-green text-xs px-3">Current</div>}
                            <div className="flex items-center gap-2 mb-3">
                                <Icon size={20} className="text-brand-400" />
                                <h3 className="font-semibold">{plan.name}</h3>
                            </div>
                            <p className="text-3xl font-bold mb-4">${plan.price}<span className="text-sm text-surface-200/40 font-normal">/mo</span></p>
                            <ul className="space-y-2 mb-6">
                                {plan.features.map((f: string) => (
                                    <li key={f} className="text-sm text-surface-200/60 flex items-center gap-2">
                                        <Check size={14} className="text-emerald-400 flex-shrink-0" />{f}
                                    </li>
                                ))}
                            </ul>
                            {!isCurrent && plan.id !== 'FREE' && (
                                <button
                                    onClick={() => subscribeMutation.mutate(plan.id)}
                                    disabled={subscribeMutation.isPending}
                                    className="btn-primary w-full text-sm"
                                >
                                    {subscribeMutation.isPending ? 'Loading...' : 'Upgrade'}
                                </button>
                            )}
                            {isCurrent && currentPlan !== 'FREE' && (
                                <button onClick={() => cancelMutation.mutate()} className="btn-secondary w-full text-sm">Cancel Plan</button>
                            )}
                        </div>
                    );
                })}
            </div>

            {invoices.length > 0 && (
                <div className="glass-card">
                    <h3 className="font-semibold mb-4">Invoices</h3>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-surface-200/40 border-b border-surface-700/50">
                                <th className="text-left pb-3">Date</th>
                                <th className="text-right pb-3">Amount</th>
                                <th className="text-left pb-3">Status</th>
                                <th className="text-right pb-3">PDF</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-700/30">
                            {invoices.map((inv: any) => (
                                <tr key={inv.id}>
                                    <td className="py-3">{new Date(inv.date * 1000).toLocaleDateString()}</td>
                                    <td className="py-3 text-right font-mono">${(inv.amount / 100).toFixed(2)}</td>
                                    <td className="py-3"><span className="badge-green">{inv.status}</span></td>
                                    <td className="py-3 text-right">
                                        {inv.pdfUrl && <a href={inv.pdfUrl} target="_blank" className="text-brand-400 hover:underline text-xs">Download</a>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
