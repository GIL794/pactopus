import { NextRequest, NextResponse } from 'next/server';
import { verifyEvmOwnerSignature } from '@/lib/auth-algo-server';
import { createSubscriptionCheckoutSession } from '@/lib/circle-checkout';
import { isLegacyArcRouteEnabled, buildLegacyRouteDecommissionedResponse } from '@/lib/legacy-route-gate';
import { rateLimitForSubscriptionUpgrade } from '@/lib/rate-limit';
import { safeLogger } from '@/lib/log-redact';
import { UpgradeRequestZ, safeParse } from '@/lib/schemas';

export async function POST(request: NextRequest) {
  if (!isLegacyArcRouteEnabled()) {
    return buildLegacyRouteDecommissionedResponse('/api/circle/checkout');
  }
  try {
    const rawBody = await request.json();
    const auth = await verifyEvmOwnerSignature(request, rawBody);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error, authRequired: true },
        { status: auth.status }
      );
    }
    const wallet = auth.wallet;
    const rl = await rateLimitForSubscriptionUpgrade(request, wallet);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Upgrade rate-limit reached. Retry in ${rl.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }
    const parsed = safeParse(UpgradeRequestZ, rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid upgrade payload.', issues: parsed.issues },
        { status: 400 }
      );
    }
    const session = await createSubscriptionCheckoutSession({
      customerWallet: wallet,
      tier: parsed.data.tier,
      successUrl: parsed.data.successUrl,
      cancelUrl: parsed.data.cancelUrl,
    });
    safeLogger.info(`[Circle:checkout] session=${session.id} tier=${session.tier} wallet=${wallet}`);
    return NextResponse.json({ session }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    safeLogger.warn('[Circle:checkout] create session failed:', err);
    return NextResponse.json(
      { error: msg || 'Failed to create Circle checkout session.' },
      { status: 500 }
    );
  }
}
