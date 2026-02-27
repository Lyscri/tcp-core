-- ============================================================
-- Trade Copy Platform - ClickHouse Schema
-- ============================================================

-- Trades table (immutable, append-only)
CREATE TABLE IF NOT EXISTS trades (
    id              String,
    user_id         String,
    account_id      String,
    broker_type     String,
    symbol          String,
    side            Enum8('BUY' = 1, 'SELL' = 2),
    type            Enum8('MARKET' = 1, 'LIMIT' = 2, 'STOP' = 3, 'STOP_LIMIT' = 4),
    status          Enum8('PENDING' = 1, 'FILLED' = 2, 'PARTIALLY_FILLED' = 3, 'CANCELLED' = 4, 'REJECTED' = 5, 'EXPIRED' = 6),
    requested_lots  Float64,
    filled_lots     Float64,
    requested_price Nullable(Float64),
    filled_price    Nullable(Float64),
    stop_loss       Nullable(Float64),
    take_profit     Nullable(Float64),
    commission      Float64 DEFAULT 0,
    swap            Float64 DEFAULT 0,
    profit          Float64 DEFAULT 0,
    pnl             Float64 DEFAULT 0,
    source_trade_id Nullable(String),
    idempotency_key String,
    latency_ms      UInt32 DEFAULT 0,
    opened_at       DateTime64(3),
    closed_at       Nullable(DateTime64(3)),
    created_at      DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(opened_at)
ORDER BY (user_id, account_id, opened_at, id)
TTL opened_at + INTERVAL 5 YEAR;

-- Daily PnL materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_pnl_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(trade_date)
ORDER BY (user_id, account_id, trade_date)
AS SELECT
    user_id,
    account_id,
    toDate(opened_at) AS trade_date,
    sum(pnl) AS total_pnl,
    count() AS trade_count,
    countIf(pnl > 0) AS win_count,
    countIf(pnl <= 0) AS loss_count,
    sumIf(pnl, pnl > 0) AS total_wins,
    sumIf(pnl, pnl <= 0) AS total_losses,
    sum(filled_lots) AS total_volume,
    avg(latency_ms) AS avg_latency_ms,
    max(latency_ms) AS max_latency_ms
FROM trades
WHERE status = 'FILLED'
GROUP BY user_id, account_id, trade_date;

-- Hourly metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_metrics_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (user_id, hour)
AS SELECT
    user_id,
    toStartOfHour(opened_at) AS hour,
    count() AS trade_count,
    sum(pnl) AS total_pnl,
    sum(commission) AS total_commission,
    avg(latency_ms) AS avg_latency
FROM trades
WHERE status = 'FILLED'
GROUP BY user_id, hour;

-- Symbol performance
CREATE MATERIALIZED VIEW IF NOT EXISTS symbol_performance_mv
ENGINE = SummingMergeTree()
ORDER BY (user_id, symbol)
AS SELECT
    user_id,
    symbol,
    count() AS trade_count,
    sum(pnl) AS total_pnl,
    countIf(pnl > 0) AS wins,
    countIf(pnl <= 0) AS losses,
    sum(filled_lots) AS total_volume
FROM trades
WHERE status = 'FILLED'
GROUP BY user_id, symbol;
