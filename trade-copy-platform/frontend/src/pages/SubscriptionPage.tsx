import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { CreditCard, Check, Zap, Star, Building2, Loader2, X, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

const planIcons: Record<string, any> = { FREE: Zap, STARTER: Star, PROFESSIONAL: CreditCard, ENTERPRISE: Building2 };

export function SubscriptionPage() {
    const queryClient = useQueryClient();
    const [processingPlan, setProcessingPlan] = useState<string | null>(null);
    const [paymentModalPlan, setPaymentModalPlan] = useState<string | null>(null);

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
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['subscription'] });
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            setProcessingPlan(null);
        },
    });

    const cancelMutation = useMutation({
        mutationFn: () => api.post('/payments/cancel'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['subscription'] });
        },
    });

    const handleUpgradeClick = (planId: string) => {
        setPaymentModalPlan(planId);
    };

    const handlePaymentSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentModalPlan) return;

        const planId = paymentModalPlan;
        setPaymentModalPlan(null);
        setProcessingPlan(planId);

        // Simulate a payment gateway processing delay
        setTimeout(() => {
            subscribeMutation.mutate(planId);
        }, 2000);
    };

    const currentPlan = subscription?.plan ?? 'FREE';
    const selectedPlanDetails = plans.find(p => p.id === paymentModalPlan);

    return (
        <div className="space-y-6 relative">
            {/* Payment Details Form Modal */}
            {paymentModalPlan && selectedPlanDetails && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/80 backdrop-blur-sm p-4">
                    <div className="glass-card w-full max-w-md relative animate-slide-up">
                        <button onClick={() => setPaymentModalPlan(null)} className="absolute top-4 right-4 text-surface-200/50 hover:text-white">
                            <X size={20} />
                        </button>
                        <h3 className="text-xl font-bold mb-1">Secure Checkout</h3>
                        <p className="text-sm text-surface-200/50 mb-6">Upgrade to {selectedPlanDetails.name} Plan - ${selectedPlanDetails.price}/mo</p>

                        <form onSubmit={handlePaymentSubmit} className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-surface-200/70 mb-1.5 block">Cardholder Name</label>
                                <input type="text" className="input w-full" placeholder="John Doe" required />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-surface-200/70 mb-1.5 block">Card Number</label>
                                <div className="relative">
                                    <input type="text" className="input w-full pl-10" placeholder="0000 0000 0000 0000" maxLength={19} required />
                                    <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-200/50" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-surface-200/70 mb-1.5 block">Expiry Date</label>
                                    <input type="text" className="input w-full" placeholder="MM/YY" maxLength={5} required />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-surface-200/70 mb-1.5 block">CVC</label>
                                    <input type="password" className="input w-full" placeholder="123" maxLength={4} required />
                                </div>
                            </div>

                            <div className="pt-4">
                                <button type="submit" className="btn-primary w-full shadow-lg shadow-brand-500/20">
                                    Pay ${selectedPlanDetails.price}
                                </button>
                                <p className="text-xs text-center text-surface-200/40 mt-3 flex items-center justify-center gap-1">
                                    <Zap size={12} /> Payments are simulated and secure.
                                </p>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Processing Modal */}
            {processingPlan && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/80 backdrop-blur-sm">
                    <div className="glass-card p-8 flex flex-col items-center max-w-sm text-center animate-slide-up">
                        <Loader2 size={40} className="text-brand-400 animate-spin mb-4" />
                        <h3 className="text-xl font-bold mb-2">Processing Payment...</h3>
                        <p className="text-sm text-surface-200/60">Please wait while we securely process your payment and upgrade you to the {plans.find(p => p.id === processingPlan)?.name} plan.</p>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Subscription</h2>
                    <p className="text-surface-200/50 text-sm mt-1">Manage your plan and billing</p>
                </div>
                <button onClick={() => {
                    // Trigger refetch of queries
                    const queryClient = useQueryClient();
                    queryClient.invalidateQueries({ queryKey: ['subscription'] });
                    queryClient.invalidateQueries({ queryKey: ['plans'] });
                    queryClient.invalidateQueries({ queryKey: ['invoices'] });
                }} className="btn-secondary flex items-center gap-2">
                    <RefreshCw size={16} /><span>Refresh Data</span>
                </button>
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
                                    onClick={() => handleUpgradeClick(plan.id)}
                                    disabled={processingPlan !== null || paymentModalPlan !== null}
                                    className="btn-primary w-full text-sm"
                                >
                                    Upgrade
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
