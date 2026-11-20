import { NextRequest, NextResponse } from 'next/server';
import { prisma, isCloudDbEnabled } from '@/lib/db';
import { parseSettlementWebhook } from '@/lib/circle-checkout';
import { safeLogger } from '@/lib/log-redact';
import { SUBSCRIPTION_LIMITS } from '@/lib/billing';
import { authorizeWebhook } from '@/lib/webhook-signature';
import { SUBSCRIPTION_PRICES_USD } from '@/lib/circle-checkout';

/**
 * Circle Payments Webhook handler.
 *
 * Receives `checkout.session.completed` events when a card-onramp subscription
 * upgrade successfully settles into the Circle USDC wallet. The `meta` object
 * encoded at session creation time carries `{wallet, tier}` — these are
 * server-signed values (browser never told us which tier to issue) so an
 * attacker can't replay a 15 USDC paid event and claim a Business tier.
 *
 * @returns 200 {received:true} on ANY valid parse — Circle retries webhooks on
 * non-2xx and we'd rather double-log than double-upsert (the upsert is
 * idempotent by design).
 */
export async function POST(request: NextRequest) {
  try {
    // Signature is mandatory whenever a secret is configured (a missing header is rejected),
    // and a missing secret is rejected in production. Only local dev may run without one.
    const rawText = await request.text();
    const auth = authorizeWebhook({
      secret: process.env.CIRCLE_WEBHOOK_SIGNING_SECRET,
      header: request.headers.get('x-circle-signature'),
      rawBody: rawText,
      nodeEnv: process.env.NODE_ENV,
    });
    if (!auth.ok) {
      safeLogger.warn(`[Circle:webhook] rejected: ${auth.error}`);
      return NextResponse.json({ received: false, error: auth.error }, { status: auth.status });
    }
    let parsedBody: Record<string, unknown>;
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ received: false, error: 'Invalid JSON.' }, { status: 400 });
    }
    const event = parseSettlementWebhook(parsedBody);
    if (!event) {
      safeLogger.warn('[Circle:webhook] payload did not pass structural validation.');
      return NextResponse.json({ received: false, error: 'Unrecognized payload.' }, { status: 400 });
    }
    safeLogger.info(
      `[Circle:webhook] ${event.type} session=${event.sessionId} wallet=${event.customerWallet} tier=${event.tier} amount=${event.amountUsd}`
    );
    if (event.type === 'checkout.session.completed') {
      // Never grant a tier unless the paid amount equals that tier's price and a session id is present.
      if (!event.sessionId || event.amountUsd !== SUBSCRIPTION_PRICES_USD[event.tier as 'pro' | 'business'].amount) {
        safeLogger.warn('[Circle:webhook] amount/session does not match the tier price. Not upgrading.');
        return NextResponse.json({ received: false, error: 'Amount or session mismatch.' }, { status: 400 });
      }
      if (isCloudDbEnabled && prisma) {
        await prisma.subscription.upsert({
          where: { address: event.customerWallet },
          update: { tier: event.tier, updatedAt: new Date(), sessionId: event.sessionId || null, txHash: event.id },
          create: { address: event.customerWallet, tier: event.tier, sessionId: event.sessionId || null, txHash: event.id },
        });
        safeLogger.info(
          `[Circle:webhook] upserted tier=${event.tier} wallet=${event.customerWallet} limits=${SUBSCRIPTION_LIMITS[event.tier]}`
        );
      }
    }
    return NextResponse.json({ received: true, eventId: event.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    safeLogger.error('[Circle:webhook] handler failed:', err);
    // Return 200 on internal errors to prevent Circle replaying this webhook
    // infinitely; the log + alerting paths surface the exception to oncall.
    return NextResponse.json({ received: true, internalError: msg });
  }
}
