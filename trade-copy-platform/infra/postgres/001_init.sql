-- ============================================================
-- Trade Copy Platform - PostgreSQL Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────────────────────────────────────────────────
-- Users
-- ──────────────────────────────────────────────────────────────

CREATE TABLE users (
    id              VARCHAR(21) PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    name            VARCHAR(100) NOT NULL,
    password_hash   TEXT NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN', 'SUPERADMIN')),
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    two_factor_secret TEXT,
    suspended       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ──────────────────────────────────────────────────────────────
-- Refresh Tokens
-- ──────────────────────────────────────────────────────────────

CREATE TABLE refresh_tokens (
    id          VARCHAR(21) PRIMARY KEY,
    user_id     VARCHAR(21) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(128) NOT NULL UNIQUE,
    family      VARCHAR(36) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- ──────────────────────────────────────────────────────────────
-- Broker Accounts
-- ──────────────────────────────────────────────────────────────

CREATE TABLE broker_accounts (
    id              VARCHAR(21) PRIMARY KEY,
    user_id         VARCHAR(21) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    broker_type     VARCHAR(20) NOT NULL CHECK (broker_type IN ('SIMULATED', 'MT4', 'MT5', 'CTRADER', 'FIX')),
    account_id      VARCHAR(255) NOT NULL,
    label           VARCHAR(100) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('ACTIVE', 'DISABLED', 'PENDING', 'ERROR')),
    is_leader       BOOLEAN NOT NULL DEFAULT FALSE,
    credentials     JSONB NOT NULL DEFAULT '{}',
    balance         DECIMAL(20, 8) NOT NULL DEFAULT 0,
    equity          DECIMAL(20, 8) NOT NULL DEFAULT 0,
    currency        VARCHAR(10) NOT NULL DEFAULT 'USD',
    last_sync_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_broker_accounts_user_id ON broker_accounts(user_id);
CREATE UNIQUE INDEX idx_broker_accounts_unique ON broker_accounts(user_id, broker_type, account_id);

-- ──────────────────────────────────────────────────────────────
-- Sync Configurations
-- ──────────────────────────────────────────────────────────────

CREATE TABLE sync_configs (
    id                  VARCHAR(21) PRIMARY KEY,
    user_id             VARCHAR(21) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leader_account_id   VARCHAR(21) NOT NULL REFERENCES broker_accounts(id) ON DELETE CASCADE,
    follower_account_id VARCHAR(21) NOT NULL REFERENCES broker_accounts(id) ON DELETE CASCADE,
    copy_mode           VARCHAR(20) NOT NULL DEFAULT 'PROPORTIONAL' CHECK (copy_mode IN ('FIXED', 'PROPORTIONAL', 'RISK_BASED', 'MULTIPLIER')),
    multiplier          DECIMAL(10, 4) NOT NULL DEFAULT 1.0,
    max_lot_size        DECIMAL(10, 4) NOT NULL DEFAULT 100.0,
    invert_trades       BOOLEAN NOT NULL DEFAULT FALSE,
    allowed_symbols     JSONB,
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_different_accounts CHECK (leader_account_id != follower_account_id)
);

CREATE INDEX idx_sync_configs_user_id ON sync_configs(user_id);
CREATE INDEX idx_sync_configs_leader ON sync_configs(leader_account_id);
CREATE UNIQUE INDEX idx_sync_configs_pair ON sync_configs(leader_account_id, follower_account_id);

-- ──────────────────────────────────────────────────────────────
-- Risk Configurations
-- ──────────────────────────────────────────────────────────────

CREATE TABLE risk_configs (
    id                  VARCHAR(21) PRIMARY KEY,
    user_id             VARCHAR(21) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id          VARCHAR(21) NOT NULL REFERENCES broker_accounts(id) ON DELETE CASCADE,
    daily_loss_limit    DECIMAL(20, 8) NOT NULL DEFAULT 0,
    trade_loss_limit    DECIMAL(20, 8) NOT NULL DEFAULT 0,
    max_open_trades     INTEGER NOT NULL DEFAULT 50,
    max_lot_size        DECIMAL(10, 4) NOT NULL DEFAULT 100.0,
    allowed_symbols     JSONB,
    kill_switch_active  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_risk_configs_account ON risk_configs(account_id);

-- ──────────────────────────────────────────────────────────────
-- Subscriptions
-- ──────────────────────────────────────────────────────────────

CREATE TABLE subscriptions (
    id                      VARCHAR(21) PRIMARY KEY,
    user_id                 VARCHAR(21) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan                    VARCHAR(20) NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE')),
    status                  VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIALING')),
    stripe_customer_id      VARCHAR(255),
    stripe_subscription_id  VARCHAR(255),
    current_period_start    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

-- ──────────────────────────────────────────────────────────────
-- System Logs
-- ──────────────────────────────────────────────────────────────

CREATE TABLE system_logs (
    id          BIGSERIAL PRIMARY KEY,
    service     VARCHAR(50) NOT NULL,
    level       VARCHAR(10) NOT NULL,
    message     TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}',
    user_id     VARCHAR(21),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_system_logs_service ON system_logs(service);
CREATE INDEX idx_system_logs_created ON system_logs(created_at DESC);
CREATE INDEX idx_system_logs_user ON system_logs(user_id);

-- ──────────────────────────────────────────────────────────────
-- Email Verification Tokens
-- ──────────────────────────────────────────────────────────────

CREATE TABLE email_verification_tokens (
    id          VARCHAR(21) PRIMARY KEY,
    user_id     VARCHAR(21) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(128) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- Password Reset Tokens
-- ──────────────────────────────────────────────────────────────

CREATE TABLE password_reset_tokens (
    id          VARCHAR(21) PRIMARY KEY,
    user_id     VARCHAR(21) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(128) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- Updated At Trigger
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_broker_accounts_updated_at BEFORE UPDATE ON broker_accounts FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_sync_configs_updated_at BEFORE UPDATE ON sync_configs FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_risk_configs_updated_at BEFORE UPDATE ON risk_configs FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
