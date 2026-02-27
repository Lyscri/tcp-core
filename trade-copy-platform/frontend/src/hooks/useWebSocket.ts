import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '../stores';

interface WsMessage {
    type: string;
    payload: unknown;
    timestamp: number;
}

export function useWebSocket() {
    const wsRef = useRef<WebSocket | null>(null);
    const [connected, setConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
    const [tradeUpdates, setTradeUpdates] = useState<WsMessage[]>([]);
    const [riskAlerts, setRiskAlerts] = useState<WsMessage[]>([]);
    const { accessToken, isAuthenticated } = useAuthStore();
    const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

    const connect = useCallback(() => {
        if (!accessToken || wsRef.current?.readyState === WebSocket.OPEN) return;

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
            wsRef.current?.close();
        };
    }, [isAuthenticated, connect]);

    const send = useCallback((type: string, payload: unknown) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
        }
    }, []);

    return { connected, lastMessage, tradeUpdates, riskAlerts, send };
}
