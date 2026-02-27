import type { BrokerAdapter } from './broker-adapter.interface.js';
import type { TradeEventDTO, OrderStatus, BrokerType } from '@tcp/shared-types';
import { OrderStatus as OS, BrokerType as BT } from '@tcp/shared-types';
import { createServiceLogger, generateId } from '@tcp/shared-utils';

const log = createServiceLogger('simulated-broker');

/**
 * Simulated broker adapter for testing and development.
 * Mimics real broker behavior with artificial latency and fill simulation.
 */
export class SimulatedBrokerAdapter implements BrokerAdapter {
    readonly brokerType: BrokerType = BT.SIMULATED;
    private connected = false;
    private balance = 100_000;
    private equity = 100_000;
    private positions: Map<string, { symbol: string; side: string; lots: number; openPrice: number; pnl: number }> = new Map();
    private priceCallbacks: Array<(symbol: string, bid: number, ask: number) => void> = [];
    private priceInterval: ReturnType<typeof setInterval> | null = null;

    async connect(_credentials: Record<string, string>): Promise<void> {
        // Simulate connection delay
        await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
        this.connected = true;
        log.info('Simulated broker connected');
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        if (this.priceInterval) {
            clearInterval(this.priceInterval);
            this.priceInterval = null;
        }
        log.info('Simulated broker disconnected');
    }

    async executeTrade(trade: TradeEventDTO): Promise<{
        brokerId: string;
        status: OrderStatus;
        filledPrice: number;
        filledLots: number;
        latencyMs: number;
    }> {
        const start = Date.now();

        // Simulate execution latency (1-15ms for HFT-like performance)
        await new Promise((r) => setTimeout(r, 1 + Math.random() * 14));

        // Simulate fill
        const basePrice = this.getSimulatedPrice(trade.symbol);
        const slippage = (Math.random() - 0.5) * 0.0002 * basePrice; // ±0.02% slippage
        const filledPrice = trade.price ?? basePrice + slippage;
        const filledLots = trade.lots;

        // Track position
        const posId = generateId();
        this.positions.set(posId, {
            symbol: trade.symbol,
            side: trade.side,
            lots: filledLots,
            openPrice: filledPrice,
            pnl: 0,
        });

        // Update balance simulation
        const commission = filledLots * 3.5; // $3.50 per lot
        this.balance -= commission;
        this.equity = this.balance;

        const latencyMs = Date.now() - start;
        log.info({ tradeId: trade.tradeId, symbol: trade.symbol, side: trade.side, lots: filledLots, price: filledPrice, latencyMs }, 'Trade executed');

        return {
            brokerId: `SIM_${posId}`,
            status: OS.FILLED,
            filledPrice,
            filledLots,
            latencyMs,
        };
    }

    async getPositions(_accountId: string): Promise<Array<{
        symbol: string;
        side: string;
        lots: number;
        openPrice: number;
        currentPrice: number;
        pnl: number;
    }>> {
        return Array.from(this.positions.values()).map((p) => ({
            ...p,
            currentPrice: this.getSimulatedPrice(p.symbol),
        }));
    }

    async getAccountInfo(_accountId: string): Promise<{
        balance: number;
        equity: number;
        margin: number;
        freeMargin: number;
        currency: string;
    }> {
        return {
            balance: this.balance,
            equity: this.equity,
            margin: this.positions.size * 1000,
            freeMargin: this.equity - this.positions.size * 1000,
            currency: 'USD',
        };
    }

    async subscribePrices(symbols: string[], callback: (symbol: string, bid: number, ask: number) => void): Promise<void> {
        this.priceCallbacks.push(callback);

        if (!this.priceInterval) {
            this.priceInterval = setInterval(() => {
                for (const symbol of symbols) {
                    const mid = this.getSimulatedPrice(symbol);
                    const spread = mid * 0.00015; // 1.5 pip spread
                    for (const cb of this.priceCallbacks) {
                        cb(symbol, mid - spread / 2, mid + spread / 2);
                    }
                }
            }, 100); // 100ms tick rate
        }
    }

    isConnected(): boolean {
        return this.connected;
    }

    private getSimulatedPrice(symbol: string): number {
        const basePrices: Record<string, number> = {
            EURUSD: 1.0850, GBPUSD: 1.2650, USDJPY: 149.50,
            BTCUSD: 42500, ETHUSD: 2250, XAUUSD: 2050,
            AAPL: 185.50, GOOGL: 141.20, MSFT: 410.80,
        };
        const base = basePrices[symbol] ?? 100;
        return base + (Math.random() - 0.5) * base * 0.001;
    }
}
