// ──────────────────────────────────────────────────────────────
// Enums
// ──────────────────────────────────────────────────────────────

export enum Role {
    USER = 'USER',
    ADMIN = 'ADMIN',
    SUPERADMIN = 'SUPERADMIN',
}

export enum AccountStatus {
    ACTIVE = 'ACTIVE',
    DISABLED = 'DISABLED',
    PENDING = 'PENDING',
    ERROR = 'ERROR',
}

export enum BrokerType {
    SIMULATED = 'SIMULATED',
    MT4 = 'MT4',
    MT5 = 'MT5',
    CTRADER = 'CTRADER',
    FIX = 'FIX',
}

export enum OrderSide {
    BUY = 'BUY',
    SELL = 'SELL',
}

export enum OrderType {
    MARKET = 'MARKET',
    LIMIT = 'LIMIT',
    STOP = 'STOP',
    STOP_LIMIT = 'STOP_LIMIT',
}

export enum OrderStatus {
    PENDING = 'PENDING',
    FILLED = 'FILLED',
    PARTIALLY_FILLED = 'PARTIALLY_FILLED',
    CANCELLED = 'CANCELLED',
    REJECTED = 'REJECTED',
    EXPIRED = 'EXPIRED',
}

export enum CopyMode {
    /** Copy exact lot size */
    FIXED = 'FIXED',
    /** Proportional to account equity */
    PROPORTIONAL = 'PROPORTIONAL',
    /** Risk-based position sizing */
    RISK_BASED = 'RISK_BASED',
    /** Multiply leader lot by factor */
    MULTIPLIER = 'MULTIPLIER',
}

export enum SubscriptionPlan {
    FREE = 'FREE',
    STARTER = 'STARTER',
    PROFESSIONAL = 'PROFESSIONAL',
    ENTERPRISE = 'ENTERPRISE',
}

export enum SubscriptionStatus {
    ACTIVE = 'ACTIVE',
    PAST_DUE = 'PAST_DUE',
    CANCELLED = 'CANCELLED',
    TRIALING = 'TRIALING',
}

export enum KafkaTopic {
    BROKER_TRADE_EVENTS = 'broker.trade.events',
    TRADE_REPLICATED = 'trade.replicated',
    TRADE_FAILED = 'trade.failed',
    RISK_ALERT = 'risk.alert',
    ACCOUNT_UPDATED = 'account.updated',
    USER_EVENTS = 'user.events',
    ANALYTICS_EVENTS = 'analytics.events',
    SYSTEM_EVENTS = 'system.events',
}

// ──────────────────────────────────────────────────────────────
// Domain Models
// ──────────────────────────────────────────────────────────────

export interface User {
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    role: Role;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
    twoFactorSecret: string | null;
    suspended: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface BrokerAccount {
    id: string;
    userId: string;
    brokerType: BrokerType;
    accountId: string;
    label: string;
    status: AccountStatus;
    isLeader: boolean;
    credentials: Record<string, string>; // encrypted
    balance: number;
    equity: number;
    currency: string;
    lastSyncAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface SyncConfig {
    id: string;
    userId: string;
    leaderAccountId: string;
    followerAccountId: string;
    copyMode: CopyMode;
    multiplier: number;
    maxLotSize: number;
    invertTrades: boolean;
    allowedSymbols: string[] | null; // null = all
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface RiskConfig {
    id: string;
    userId: string;
    accountId: string;
    dailyLossLimit: number;
    tradeLossLimit: number;
    maxOpenTrades: number;
    maxLotSize: number;
    allowedSymbols: string[] | null;
    killSwitchActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface Trade {
    id: string;
    userId: string;
    accountId: string;
    brokerType: BrokerType;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    status: OrderStatus;
    requestedLots: number;
    filledLots: number;
    requestedPrice: number | null;
    filledPrice: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
    commission: number;
    swap: number;
    profit: number;
    pnl: number;
    sourceTradeId: string | null; // leader trade ID if this is a copy
    idempotencyKey: string;
    latencyMs: number;
    openedAt: Date;
    closedAt: Date | null;
    createdAt: Date;
}

export interface Subscription {
    id: string;
    userId: string;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface RefreshToken {
    id: string;
    userId: string;
    tokenHash: string;
    family: string;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
}

// ──────────────────────────────────────────────────────────────
// DTOs
// ──────────────────────────────────────────────────────────────

export interface RegisterDTO {
    email: string;
    password: string;
    name: string;
}

export interface LoginDTO {
    email: string;
    password: string;
    twoFactorCode?: string;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

export interface CreateAccountDTO {
    brokerType: BrokerType;
    accountId: string;
    label: string;
    credentials: Record<string, string>;
}

export interface CreateSyncConfigDTO {
    leaderAccountId: string;
    followerAccountId: string;
    copyMode: CopyMode;
    multiplier?: number;
    maxLotSize?: number;
    invertTrades?: boolean;
    allowedSymbols?: string[];
}

export interface UpdateRiskConfigDTO {
    dailyLossLimit?: number;
    tradeLossLimit?: number;
    maxOpenTrades?: number;
    maxLotSize?: number;
    allowedSymbols?: string[] | null;
    killSwitchActive?: boolean;
}

export interface TradeEventDTO {
    tradeId: string;
    accountId: string;
    userId: string;
    brokerType: BrokerType;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    lots: number;
    price: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
    idempotencyKey: string;
    timestamp: number;
}

export interface RiskValidationRequest {
    userId: string;
    accountId: string;
    symbol: string;
    side: OrderSide;
    lots: number;
    estimatedLoss: number;
}

export interface RiskValidationResponse {
    allowed: boolean;
    reason?: string;
    ruleViolated?: string;
}

export interface PnLSummary {
    date: string;
    totalPnl: number;
    tradeCount: number;
    winCount: number;
    lossCount: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    maxDrawdown: number;
    volume: number;
}

export interface DashboardOverview {
    totalBalance: number;
    dailyPnl: number;
    monthlyPnl: number;
    maxDrawdown: number;
    connectedAccounts: number;
    avgLatencyMs: number;
}

// ──────────────────────────────────────────────────────────────
// Kafka Event Envelopes
// ──────────────────────────────────────────────────────────────

export interface KafkaMessage<T = unknown> {
    id: string;
    topic: KafkaTopic;
    key: string;
    payload: T;
    timestamp: number;
    correlationId: string;
    source: string;
}

// ──────────────────────────────────────────────────────────────
// WebSocket Messages
// ──────────────────────────────────────────────────────────────

export enum WsMessageType {
    TRADE_UPDATE = 'TRADE_UPDATE',
    ACCOUNT_UPDATE = 'ACCOUNT_UPDATE',
    RISK_ALERT = 'RISK_ALERT',
    ERROR = 'ERROR',
    HEARTBEAT = 'HEARTBEAT',
    SUBSCRIBE = 'SUBSCRIBE',
    UNSUBSCRIBE = 'UNSUBSCRIBE',
}

export interface WsMessage<T = unknown> {
    type: WsMessageType;
    payload: T;
    timestamp: number;
}

// ──────────────────────────────────────────────────────────────
// API Response Envelope
// ──────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
    meta?: {
        page?: number;
        limit?: number;
        total?: number;
    };
}
