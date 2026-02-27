import { z } from 'zod';

export const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

    // Database
    DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().optional(),
    CLICKHOUSE_URL: z.string().url().optional(),

    // Kafka
    KAFKA_BROKERS: z.string().default('localhost:9092'),
    KAFKA_CLIENT_ID: z.string().optional(),
    KAFKA_GROUP_ID: z.string().optional(),

    // Auth
    JWT_SECRET: z.string().min(32).optional(),
    JWT_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

    // Stripe
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),

    // Services
    AUTH_SERVICE_URL: z.string().url().optional(),
    ACCOUNT_SERVICE_URL: z.string().url().optional(),
    TRADE_SYNC_URL: z.string().url().optional(),
    RISK_ENGINE_URL: z.string().url().optional(),
    ANALYTICS_SERVICE_URL: z.string().url().optional(),
    PAYMENT_SERVICE_URL: z.string().url().optional(),
    ADMIN_SERVICE_URL: z.string().url().optional(),
    BROKER_ADAPTER_URL: z.string().url().optional(),
});

export type ServiceEnv = z.infer<typeof envSchema>;

export function loadEnv(): ServiceEnv {
    return envSchema.parse(process.env);
}
