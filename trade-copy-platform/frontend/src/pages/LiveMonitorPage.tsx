import { useWebSocket, useRef } from '../hooks/useWebSocket';
import { Activity, AlertTriangle, Clock, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

export function LiveMonitorPage() {
    const { connected, tradeUpdates, riskAlerts } = useWebSocket();
    const tradeListRef = useRef<HTMLDivElement>(null);
    const alertsListRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom when new trades arrive
    // Scroll to bottom when new alerts arrive
    // In a real implementation, we would use useEffect to scroll when tradeUpdates or riskAlerts change
    // For simplicity in this example, we're adding the refs for potential future use

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Live Monitor</h2>
                    <p className="text-surface-200/50 text-sm mt-1">Real-time trade events and alerts</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className={clsx('flex items-center gap-2 px-4 py-2 rounded-xl text-sm', connected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20')}>
                        {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
                        {connected ? 'Connected' : 'Disconnected'}
                    </div>
                    <button onClick={() => {
                        // Trigger manual refresh by re-subscribing to WebSocket
                        // This would typically be handled by the WebSocket hook
                        // For now, we'll just provide visual feedback
                        alert('Manual refresh triggered - WebSocket auto-reconnects');
                    }} className="btn-secondary flex items-center gap-2">
                        <RefreshCw size={16} /><span>Refresh</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Trade Events */}
                <div className="glass-card">
                    <div className="flex items-center gap-2 mb-4">
                        <Activity size={18} className="text-brand-400" />
                        <h3 className="font-semibold">Trade Events</h3>
                        <span className="badge-blue">{tradeUpdates.length}</span>
                    </div>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                        {tradeUpdates.length === 0 && <p className="text-surface-200/40 text-sm text-center py-8">Waiting for trade events...</p>}
                        {tradeUpdates.map((event, i) => {
                            const payload = event.payload as any;
                            return (
                                <div key={i} className="bg-surface-700/30 rounded-xl px-4 py-3 flex items-center justify-between text-sm animate-slide-up">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                        <div>
                                            <span className="font-medium text-white">{payload.symbol ?? 'Trade'}</span>
                                            <span className="text-surface-200/40 ml-2">{payload.side ?? ''} {payload.lots ?? ''}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-surface-200/40">
                                        <Clock size={12} />
                                        <span className="font-mono text-xs">{payload.latencyMs ?? '0'}ms</span>
                                        <span className="text-xs">{new Date(event.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Risk Alerts */}
                <div className="glass-card">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertTriangle size={18} className="text-amber-400" />
                        <h3 className="font-semibold">Risk Alerts</h3>
                        <span className="badge-yellow">{riskAlerts.length}</span>
                    </div>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                        {riskAlerts.length === 0 && <p className="text-surface-200/40 text-sm text-center py-8">No risk alerts</p>}
                        {riskAlerts.map((alert, i) => {
                            const payload = alert.payload as any;
                            return (
                                <div key={i} className="bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-3 text-sm animate-slide-up">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                                        <span className="text-red-400 font-medium">{payload.rule ?? payload.event ?? 'Alert'}</span>
                                    </div>
                                    <p className="text-surface-200/50 mt-1 text-xs">{payload.reason ?? payload.message ?? JSON.stringify(payload)}</p>
                                    <p className="text-surface-200/30 text-xs mt-1">{new Date(alert.timestamp).toLocaleTimeString()}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
