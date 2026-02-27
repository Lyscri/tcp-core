import { z } from 'zod';
import { CopyMode, BrokerType } from '@tcp/shared-types';

export const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Must contain uppercase letter')
        .regex(/[a-z]/, 'Must contain lowercase letter')
        .regex(/[0-9]/, 'Must contain digit')
        .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
    name: z.string().min(2).max(100),
});

export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    twoFactorCode: z.string().length(6).optional(),
});

export const createAccountSchema = z.object({
    brokerType: z.nativeEnum(BrokerType),
    accountId: z.string().min(1).max(255),
    label: z.string().min(1).max(100),
    credentials: z.record(z.string()),
});

export const createSyncConfigSchema = z.object({
    leaderAccountId: z.string().min(1),
    followerAccountId: z.string().min(1),
    copyMode: z.nativeEnum(CopyMode),
    multiplier: z.number().positive().max(100).default(1),
    maxLotSize: z.number().positive().max(1000).default(100),
    invertTrades: z.boolean().default(false),
    allowedSymbols: z.array(z.string()).optional(),
});

export const updateRiskConfigSchema = z.object({
    dailyLossLimit: z.number().nonnegative().optional(),
    tradeLossLimit: z.number().nonnegative().optional(),
    maxOpenTrades: z.number().int().positive().max(1000).optional(),
    maxLotSize: z.number().positive().max(1000).optional(),
    allowedSymbols: z.array(z.string()).nullable().optional(),
    killSwitchActive: z.boolean().optional(),
});

export const paginationSchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;
