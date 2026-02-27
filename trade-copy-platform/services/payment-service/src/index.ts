import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import Stripe from 'stripe';
import { createServiceLogger, errorHandler, loadEnv, ValidationError, NotFoundError } from '@tcp/shared-utils';
import { PostgresClient } from '@tcp/shared-db';
import type { SubscriptionPlan, SubscriptionStatus } from '@tcp/shared-types';

const log = createServiceLogger('payment-service');
const env = loadEnv();

const db = new PostgresClient();
const stripe = new Stripe(env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', { apiVersion: '2024-12-18.acacia' });
const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET ?? 'whsec_placeholder';

const PLAN_PRICES: Record<string, { priceId: string; name: string; amount: number }> = {
    STARTER: { priceId: 'price_starter', name: 'Starter', amount: 2900 },
    PROFESSIONAL: { priceId: 'price_professional', name: 'Professional', amount: 7900 },
    ENTERPRISE: { priceId: 'price_enterprise', name: 'Enterprise', amount: 19900 },
};

const app = new Hono();
app.onError((err, c) => errorHandler(err, c));
app.get('/health', (c) => c.json({ status: 'ok', service: 'payment-service' }));

// ── Get Subscription ─────────────────────────────────────────

app.get('/payments/subscription', async (c) => {
    const userId = c.req.header('x-user-id') ?? '';
    const result = await db.query('SELECT * FROM subscriptions WHERE user_id = $1', [userId]);
    const sub = result.rows[0];
    if (!sub) return c.json({ success: true, data: { plan: 'FREE', status: 'ACTIVE' } });
    return c.json({ success: true, data: sub });
});

// ── Create/Upgrade Subscription ──────────────────────────────

app.post('/payments/subscribe', async (c) => {
    const userId = c.req.header('x-user-id') ?? '';
    const { plan } = await c.req.json() as { plan: string };

    const planInfo = PLAN_PRICES[plan];
    if (!planInfo) throw new ValidationError('Invalid plan');

    // Check if user has a Stripe customer
    let customerId: string;
    const existing = await db.query('SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1', [userId]);

    if (existing.rows[0]?.stripe_customer_id) {
        customerId = existing.rows[0].stripe_customer_id;
    } else {
        const customer = await stripe.customers.create({
            metadata: { userId },
        });
        customerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: planInfo.priceId, quantity: 1 }],
        success_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:5173'}/subscription/success`,
        cancel_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:5173'}/subscription/cancel`,
        metadata: { userId, plan },
    });

    return c.json({ success: true, data: { sessionUrl: session.url } });
});

// ── Cancel Subscription ──────────────────────────────────────

app.post('/payments/cancel', async (c) => {
    const userId = c.req.header('x-user-id') ?? '';
    const result = await db.query('SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1', [userId]);
    const subId = result.rows[0]?.stripe_subscription_id;
    if (!subId) throw new NotFoundError('Subscription');

    await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    await db.query("UPDATE subscriptions SET status = 'CANCELLED' WHERE user_id = $1", [userId]);

    return c.json({ success: true });
});

// ── Invoices ─────────────────────────────────────────────────

app.get('/payments/invoices', async (c) => {
    const userId = c.req.header('x-user-id') ?? '';
    const result = await db.query('SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1', [userId]);
    const customerId = result.rows[0]?.stripe_customer_id;
    if (!customerId) return c.json({ success: true, data: [] });

    const invoices = await stripe.invoices.list({ customer: customerId, limit: 20 });
    return c.json({
        success: true,
        data: invoices.data.map((i) => ({
            id: i.id,
            amount: i.amount_due,
            status: i.status,
            date: i.created,
            pdfUrl: i.invoice_pdf,
        })),
    });
});

// ── Stripe Webhook ───────────────────────────────────────────

app.post('/payments/webhook', async (c) => {
    const sig = c.req.header('stripe-signature') ?? '';
    const body = await c.req.text();

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
    } catch (err) {
        log.error({ error: err }, 'Webhook signature verification failed');
        return c.json({ error: 'Invalid signature' }, 400);
    }

    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = session.metadata?.['userId'];
            const plan = session.metadata?.['plan'];
            if (userId && plan) {
                await db.query(
                    `INSERT INTO subscriptions (id, user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end)
           VALUES ($1, $2, $3, 'ACTIVE', $4, $5, NOW(), NOW() + INTERVAL '30 days')
           ON CONFLICT (user_id) DO UPDATE SET plan=$3, status='ACTIVE', stripe_customer_id=$4, stripe_subscription_id=$5, current_period_start=NOW(), current_period_end=NOW()+INTERVAL '30 days'`,
                    [
                        (await import('@tcp/shared-utils')).generateId(),
                        userId, plan, session.customer, session.subscription,
                    ]
                );
                log.info({ userId, plan }, 'Subscription activated');
            }
            break;
        }

        case 'invoice.paid': {
            const invoice = event.data.object as Stripe.Invoice;
            if (invoice.subscription) {
                await db.query(
                    "UPDATE subscriptions SET status='ACTIVE', current_period_end=NOW()+INTERVAL '30 days' WHERE stripe_subscription_id=$1",
                    [invoice.subscription]
                );
            }
            break;
        }

        case 'customer.subscription.deleted': {
            const sub = event.data.object as Stripe.Subscription;
            await db.query(
                "UPDATE subscriptions SET status='CANCELLED' WHERE stripe_subscription_id=$1",
                [sub.id]
            );
            break;
        }

        case 'invoice.payment_failed': {
            const invoice = event.data.object as Stripe.Invoice;
            if (invoice.subscription) {
                await db.query(
                    "UPDATE subscriptions SET status='PAST_DUE' WHERE stripe_subscription_id=$1",
                    [invoice.subscription]
                );
            }
            break;
        }
    }

    return c.json({ received: true });
});

// ── Plans Info ────────────────────────────────────────────────

app.get('/payments/plans', (c) => {
    return c.json({
        success: true,
        data: [
            { id: 'FREE', name: 'Free', price: 0, features: ['1 account', 'Basic analytics'] },
            { id: 'STARTER', name: 'Starter', price: 29, features: ['3 accounts', 'Trade copying', 'Daily analytics'] },
            { id: 'PROFESSIONAL', name: 'Professional', price: 79, features: ['10 accounts', 'Advanced risk controls', 'Real-time analytics', 'Priority support'] },
            { id: 'ENTERPRISE', name: 'Enterprise', price: 199, features: ['Unlimited accounts', 'Custom adapters', 'Dedicated support', 'SLA'] },
        ],
    });
});

const port = env.PORT || 3007;
serve({ fetch: app.fetch, port: Number(port) }, (info) => {
    log.info({ port: info.port }, 'Payment service running');
});
