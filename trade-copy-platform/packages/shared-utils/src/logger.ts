import pino from 'pino';

export type Logger = pino.Logger;

const baseConfig: pino.LoggerOptions = {
    level: process.env['LOG_LEVEL'] ?? 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level(label) {
            return { level: label };
        },
    },
    redact: {
        paths: [
            'req.headers.authorization',
            'password',
            'passwordHash',
            'credentials',
            'twoFactorSecret',
            'accessToken',
            'refreshToken',
        ],
        censor: '[REDACTED]',
    },
};

export const logger = pino(baseConfig);

export function createServiceLogger(serviceName: string): pino.Logger {
    return logger.child({ service: serviceName });
}
