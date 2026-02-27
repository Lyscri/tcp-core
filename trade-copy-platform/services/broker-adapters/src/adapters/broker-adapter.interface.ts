import type { TradeEventDTO, OrderStatus, BrokerType } from '@tcp/shared-types';

/**
 * Interface for all broker adapters.
 * Each broker implementation must conform to this contract.
 */
export interface BrokerAdapter {
    readonly brokerType: BrokerType;

    /** Connect to the broker API */
    connect(credentials: Record<string, string>): Promise<void>;

    /** Disconnect from the broker API */
    disconnect(): Promise<void>;

    /** Execute a trade order */
    executeTrade(trade: TradeEventDTO): Promise<{
        brokerId: string;
        status: OrderStatus;
        filledPrice: number;
        filledLots: number;
        latencyMs: number;
    }>;

    /** Get open positions */
    getPositions(accountId: string): Promise<Array<{
        symbol: string;
        side: string;
        lots: number;
        openPrice: number;
        currentPrice: number;
        pnl: number;
    }>>;

    /** Get account balance/equity */
    getAccountInfo(accountId: string): Promise<{
        balance: number;
        equity: number;
        margin: number;
        freeMargin: number;
        currency: string;
    }>;

    /** Subscribe to price feeds (WebSocket) */
    subscribePrices(symbols: string[], callback: (symbol: string, bid: number, ask: number) => void): Promise<void>;

    /** Check connection health */
    isConnected(): boolean;
}
