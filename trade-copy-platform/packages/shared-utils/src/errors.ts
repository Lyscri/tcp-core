import type { Context } from 'hono';

// ──────────────────────────────────────────────────────────────
// Error Codes
// ──────────────────────────────────────────────────────────────

export type ErrorCode =
    | 'AUTHENTICATION_ERROR'
    | 'AUTHORIZATION_ERROR'
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'CONFLICT'
    | 'RISK_VIOLATION'
    | 'EXTERNAL_SERVICE_ERROR'
    | 'RATE_LIMIT_ERROR'
    | 'INTERNAL_ERROR';

// ──────────────────────────────────────────────────────────────
// Custom Error Classes
// ──────────────────────────────────────────────────────────────

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: ErrorCode;
    public readonly isOperational: boolean;
    public readonly details?: unknown;

    constructor(
        message: string,
        statusCode: number,
        code: ErrorCode,
        isOperational = true,
        details?: unknown
    ) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = isOperational;
        this.details = details;
        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this, this.constructor);
    }
}

export class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}

export class AuthorizationError extends AppError {
    constructor(message = 'Insufficient permissions') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string, id?: string) {
        const msg = id ? `${resource} with id ${id} not found` : `${resource} not found`;
        super(msg, 404, 'NOT_FOUND');
    }
}

export class ValidationError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 400, 'VALIDATION_ERROR', true, details);
    }
}

export class ConflictError extends AppError {
    constructor(message: string) {
        super(message, 409, 'CONFLICT');
    }
}

export class RiskViolationError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 422, 'RISK_VIOLATION', true, details);
    }
}

export class ExternalServiceError extends AppError {
    constructor(service: string, message: string) {
        super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
    }
}

export class RateLimitError extends AppError {
    constructor(message = 'Rate limit exceeded') {
        super(message, 429, 'RATE_LIMIT_ERROR');
    }
}

// ──────────────────────────────────────────────────────────────
// Error Handler for HonoJS
// ──────────────────────────────────────────────────────────────

export function errorHandler(err: Error, c: Context): Response {
    if (err instanceof AppError) {
        return c.json(
            {
                success: false,
                error: {
                    code: err.code,
                    message: err.message,
                    details: err.details,
                },
            },
            err.statusCode as 400
        );
    }

    // Unexpected errors
    console.error('Unhandled error:', err);
    return c.json(
        {
            success: false,
            error: {
                code: 'INTERNAL_ERROR' as ErrorCode,
                message: 'An unexpected error occurred',
            },
        },
        500
    );
}
