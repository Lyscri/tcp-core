import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '../stores';
import { USE_MOCKS } from '../lib/api';

interface WsMessage {
    type: string;
    payload: unknown;
    timestamp: number;
}

const SYMBOLS = ['EURUSD', 'GBPUSD', 'XAUUSD', 'US30', 'BTCUSD'];
const SIDES = ['BUY', 'SELL'];

export function useWebSocket() {
    const wsRef = useRef<WebSocket | null>(null);
    const [connected, setConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
    const [tradeUpdates, setTradeUpdates] = useState<WsMessage[]>([]);
    const [riskAlerts, setRiskAlerts] = useState<WsMessage[]>([]);
    const { accessToken, isAuthenticated } = useAuthStore();
    const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
    const mockInterval = useRef<ReturnType<typeof setInterval>>();

    const connect = useCallback(() => {
        if (!accessToken || wsRef.current?.readyState === WebSocket.OPEN) return;

        if (USE_MOCKS) {
            setConnected(true);
            console.log('[WS MOCK] Connected');

            // Randomly generate events
            mockInterval.current = setInterval(() => {
                const type = Math.random() > 0.8 ? 'RISK_ALERT' : 'TRADE_UPDATE';
                let msg: WsMessage;

                if (type === 'TRADE_UPDATE') {
                    msg = {
                        type,
                        timestamp: Date.now(),
                        payload: {
                            symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
                            side: SIDES[Math.floor(Math.random() * SIDES.length)],
                            lots: (Math.random() * 5 + 0.1).toFixed(2),
                            latencyMs: Math.floor(Math.random() * 150 + 10)
                        }
                    };
                    setTradeUpdates((prev) => [msg, ...prev].slice(0, 100));
                } else {
                    msg = {
                        type,
                        timestamp: Date.now(),
                        payload: {
                            rule: 'Max Drawdown Exceeded',
                            reason: `Account dropped below allowed equity limit. Open trades were evaluated.`,
                        }
                    };
                    setRiskAlerts((prev) => [msg, ...prev].slice(0, 50));
                }
                setLastMessage(msg);
            }, 3000); // 3 seconds per simulated event
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?token=${accessToken}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            console.log('[WS] Connected');
        };

        ws.onmessage = (event) => {
            try {
                const msg: WsMessage = JSON.parse(event.data);
                setLastMessage(msg);

                if (msg.type === 'TRADE_UPDATE') {
                    setTradeUpdates((prev) => [msg, ...prev].slice(0, 100));
                } else if (msg.type === 'RISK_ALERT') {
                    setRiskAlerts((prev) => [msg, ...prev].slice(0, 50));
                }
            } catch { /* ignore invalid messages */ }
        };

        ws.onclose = () => {
            setConnected(false);
            // Reconnect after 3 seconds
            reconnectTimer.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
            ws.close();
        };
    }, [accessToken]);

    useEffect(() => {
        if (isAuthenticated) connect();
        return () => {
            clearTimeout(reconnectTimer.current);
            clearInterval(mockInterval.current);
            if (!USE_MOCKS) wsRef.current?.close();
        };
    }, [isAuthenticated, connect]);

    const send = useCallback((type: string, payload: unknown) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
        }
    }, []);

    return { connected, lastMessage, tradeUpdates, riskAlerts, send };
}
