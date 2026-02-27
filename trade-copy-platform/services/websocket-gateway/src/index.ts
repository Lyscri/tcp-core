import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { createServiceLogger, loadEnv } from '@tcp/shared-utils';
import { createKafkaClient, KafkaConsumer } from '@tcp/shared-kafka';
import { KafkaTopic, WsMessageType } from '@tcp/shared-types';
import type { WsMessage } from '@tcp/shared-types';

const log = createServiceLogger('websocket-gateway');
const env = loadEnv();
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production-min32chars!!';

// ── Client Registry ──────────────────────────────────────────

interface AuthenticatedClient {
    ws: WebSocket;
    userId: string;
    email: string;
    role: string;
    subscriptions: Set<string>;
    lastPing: number;
}

const clients: Map<string, AuthenticatedClient> = new Map();

// ── HTTP + WebSocket Server ──────────────────────────────────

const server = createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'websocket-gateway', clients: clients.size }));
        return;
    }
    res.writeHead(404);
    res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    // ── Auth: Extract token from query string ─────────────
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
        ws.close(4001, 'Authentication required');
        return;
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET) as { sub: string; email: string; role: string };
        const clientId = `${payload.sub}_${Date.now()}`;
        const client: AuthenticatedClient = {
            ws,
            userId: payload.sub,
            email: payload.email,
            role: payload.role,
            subscriptions: new Set(['trades', 'risk', 'account']),
            lastPing: Date.now(),
        };

        clients.set(clientId, client);
        log.info({ userId: payload.sub, clientId, total: clients.size }, 'Client connected');

        // Send welcome
        sendToClient(ws, {
            type: WsMessageType.HEARTBEAT,
            payload: { message: 'Connected to WebSocket Gateway', clientId },
            timestamp: Date.now(),
        });

        // ── Handle Messages ─────────────────────────────────
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString()) as WsMessage;

                switch (msg.type) {
                    case WsMessageType.SUBSCRIBE:
                        const channel = (msg.payload as any)?.channel;
                        if (channel) client.subscriptions.add(channel);
                        break;
                    case WsMessageType.UNSUBSCRIBE:
                        const ch = (msg.payload as any)?.channel;
                        if (ch) client.subscriptions.delete(ch);
                        break;
                    case WsMessageType.HEARTBEAT:
                        client.lastPing = Date.now();
                        sendToClient(ws, { type: WsMessageType.HEARTBEAT, payload: { pong: true }, timestamp: Date.now() });
                        break;
                }
            } catch (error) {
                log.warn({ error }, 'Invalid WebSocket message');
            }
        });

        ws.on('close', () => {
            clients.delete(clientId);
            log.info({ clientId, total: clients.size }, 'Client disconnected');
        });

        ws.on('error', (error) => {
            log.error({ clientId, error }, 'WebSocket error');
            clients.delete(clientId);
        });

    } catch (error) {
        ws.close(4001, 'Invalid token');
    }
});

// ── Heartbeat / Stale Connection Cleanup ─────────────────────

setInterval(() => {
    const now = Date.now();
    const staleThreshold = 60_000; // 60s

    for (const [clientId, client] of clients) {
        if (now - client.lastPing > staleThreshold) {
            log.warn({ clientId }, 'Closing stale connection');
            client.ws.close(4002, 'Connection timed out');
            clients.delete(clientId);
        } else if (client.ws.readyState === WebSocket.OPEN) {
            sendToClient(client.ws, { type: WsMessageType.HEARTBEAT, payload: { ping: true }, timestamp: now });
        }
    }
}, 30_000);

// ── Broadcast Helpers ────────────────────────────────────────

function sendToClient(ws: WebSocket, message: WsMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

function broadcastToUser(userId: string, message: WsMessage): void {
    for (const client of clients.values()) {
        if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
            sendToClient(client.ws, message);
        }
    }
}

function broadcastToAll(message: WsMessage): void {
    for (const client of clients.values()) {
        if (client.ws.readyState === WebSocket.OPEN) {
            sendToClient(client.ws, message);
        }
    }
}

// ── Kafka Consumer → WebSocket Broadcast ─────────────────────

async function startKafkaConsumer() {
    const kafka = createKafkaClient('websocket-gateway');
    const consumer = new KafkaConsumer(kafka, 'ws-gateway-group');

    await consumer.connect();

    // Trade events → broadcast to owner
    await consumer.subscribe(KafkaTopic.TRADE_REPLICATED, async (msg) => {
        const payload = msg.payload as any;
        broadcastToUser(payload.userId ?? '', {
            type: WsMessageType.TRADE_UPDATE,
            payload: payload,
            timestamp: Date.now(),
        });
    });

    // Risk alerts → broadcast to owner
    await consumer.subscribe(KafkaTopic.RISK_ALERT, async (msg) => {
        const payload = msg.payload as any;
        broadcastToUser(payload.userId ?? '', {
            type: WsMessageType.RISK_ALERT,
            payload: payload,
            timestamp: Date.now(),
        });
    });

    // Account updates → broadcast to owner
    await consumer.subscribe(KafkaTopic.ACCOUNT_UPDATED, async (msg) => {
        const payload = msg.payload as any;
        broadcastToUser(payload.userId ?? payload?.account?.userId ?? '', {
            type: WsMessageType.ACCOUNT_UPDATE,
            payload: payload,
            timestamp: Date.now(),
        });
    });

    await consumer.start();
    log.info('Kafka → WebSocket bridge started');
}

startKafkaConsumer().catch((err) => {
    log.error({ error: err }, 'Failed to start Kafka consumer');
});

// ── Start Server ─────────────────────────────────────────────

const port = Number(env.PORT || 3009);
server.listen(port, () => {
    log.info({ port }, 'WebSocket Gateway running');
});
