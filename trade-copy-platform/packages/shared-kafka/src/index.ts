import { Kafka, Producer, Consumer, EachMessagePayload, logLevel, CompressionTypes } from 'kafkajs';
import type { KafkaMessage, KafkaTopic } from '@tcp/shared-types';
import { createServiceLogger, generateId, generateCorrelationId, retry } from '@tcp/shared-utils';

const log = createServiceLogger('kafka');

// ──────────────────────────────────────────────────────────────
// Kafka Client Factory
// ──────────────────────────────────────────────────────────────

export function createKafkaClient(clientId: string, brokers?: string): Kafka {
    const brokerList = (brokers ?? process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');
    return new Kafka({
        clientId,
        brokers: brokerList,
        logLevel: logLevel.WARN,
        retry: {
            initialRetryTime: 300,
            retries: 10,
            maxRetryTime: 30000,
            factor: 2,
        },
    });
}

// ──────────────────────────────────────────────────────────────
// Producer Wrapper
// ──────────────────────────────────────────────────────────────

export class KafkaProducer {
    private producer: Producer;
    private connected = false;
    private readonly serviceName: string;

    constructor(kafka: Kafka, serviceName: string) {
        this.serviceName = serviceName;
        this.producer = kafka.producer({
            idempotent: true,
            maxInFlightRequests: 5,
            transactionTimeout: 30000,
        });
    }

    async connect(): Promise<void> {
        if (this.connected) return;
        await retry(async () => {
            await this.producer.connect();
            this.connected = true;
            log.info('Kafka producer connected');
        }, { maxAttempts: 5, baseDelayMs: 1000 });
    }

    async publish<T>(
        topic: KafkaTopic,
        key: string,
        payload: T,
        correlationId?: string
    ): Promise<void> {
        if (!this.connected) await this.connect();

        const message: KafkaMessage<T> = {
            id: generateId(),
            topic,
            key,
            payload,
            timestamp: Date.now(),
            correlationId: correlationId ?? generateCorrelationId(),
            source: this.serviceName,
        };

        await this.producer.send({
            topic,
            compression: CompressionTypes.LZ4,
            messages: [
                {
                    key,
                    value: JSON.stringify(message),
                    headers: {
                        correlationId: message.correlationId,
                        source: this.serviceName,
                    },
                },
            ],
        });

        log.debug({ topic, key, correlationId: message.correlationId }, 'Message published');
    }

    async disconnect(): Promise<void> {
        if (!this.connected) return;
        await this.producer.disconnect();
        this.connected = false;
        log.info('Kafka producer disconnected');
    }
}

// ──────────────────────────────────────────────────────────────
// Consumer Wrapper
// ──────────────────────────────────────────────────────────────

export type MessageHandler<T = unknown> = (
    message: KafkaMessage<T>,
    raw: EachMessagePayload
) => Promise<void>;

export class KafkaConsumer {
    private consumer: Consumer;
    private connected = false;
    private handlers: Map<string, MessageHandler> = new Map();

    constructor(kafka: Kafka, groupId: string) {
        this.consumer = kafka.consumer({
            groupId,
            sessionTimeout: 30000,
            heartbeatInterval: 3000,
            maxWaitTimeInMs: 100,
            retry: { retries: 10 },
        });
    }

    async connect(): Promise<void> {
        if (this.connected) return;
        await retry(async () => {
            await this.consumer.connect();
            this.connected = true;
            log.info('Kafka consumer connected');
        }, { maxAttempts: 5, baseDelayMs: 1000 });
    }

    async subscribe(topic: KafkaTopic, handler: MessageHandler): Promise<void> {
        this.handlers.set(topic, handler);
        await this.consumer.subscribe({ topic, fromBeginning: false });
        log.info({ topic }, 'Subscribed to topic');
    }

    async start(): Promise<void> {
        await this.consumer.run({
            autoCommit: true,
            autoCommitInterval: 5000,
            eachMessage: async (payload) => {
                const { topic, message } = payload;
                const handler = this.handlers.get(topic);
                if (!handler) return;

                try {
                    const parsed: KafkaMessage = JSON.parse(message.value?.toString() ?? '{}');
                    await handler(parsed, payload);
                } catch (error) {
                    log.error({ error, topic, offset: message.offset }, 'Failed to process message');
                    // In production: publish to dead letter queue
                }
            },
        });

        log.info('Kafka consumer started');
    }

    async disconnect(): Promise<void> {
        if (!this.connected) return;
        await this.consumer.disconnect();
        this.connected = false;
        log.info('Kafka consumer disconnected');
    }
}

export { Kafka } from 'kafkajs';
