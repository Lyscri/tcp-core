import { nanoid } from 'nanoid';

/** Generate a URL-safe unique ID (21 chars) */
export function generateId(): string {
    return nanoid(21);
}

/** Generate a correlation ID for distributed tracing (prefixed) */
export function generateCorrelationId(): string {
    return `cor_${nanoid(16)}`;
}
