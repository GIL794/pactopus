import { NextRequest, NextResponse } from 'next/server';
import { safeLogger } from '@/lib/log-redact';
import { SUBSCRIPTION_LIMITS } from '@/lib/billing';
import { isMockApprovalAllowed } from '@/lib/webhook-signature';
import { isLegacyArcRouteEnabled, buildLegacyRouteDecommissionedResponse } from '@/lib/legacy-route-gate';

function isMockAllowed(): boolean {
  return isMockApprovalAllowed(process.env.NODE_ENV) && isLegacyArcRouteEnabled();
}

export async function GET(request: NextRequest) {
  if (!isLegacyArcRouteEnabled()) {
    return buildLegacyRouteDecommissionedResponse('/api/circle/mock-approve');
  }
  if (!isMockAllowed()) {
    return NextResponse.json(
      {
        error:
          'Mock flow is not enabled. The mock approval flow is available in local development only.',
      },
      { status: 404 }
    );
  }
  const { searchParams } = new URL(request.url);
  const session = searchParams.get('session') || 'mock';
  const tier = (searchParams.get('tier') as 'pro' | 'business') || 'pro';
  const wallet = (searchParams.get('wallet') || '').toLowerCase();
  const amount = tier === 'pro' ? 15 : 50;
  return new NextResponse(
    `<!doctype html>
<html>
<head><title>Mock Circle Checkout · Pactopus Upgrade</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 520px; margin: 4rem auto; padding: 0 1.5rem; }
  .card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 2rem; box-shadow: 0 10px 30px rgba(0,0,0,.04); }
  h1 { font-size: 1.25rem; margin-top: 0; }
  .tier { font-weight: 800; color: #c5627d; text-transform: uppercase; letter-spacing: .04em; }
  .row { display:flex; justify-content: space-between; padding:.5rem 0; border-top:1px solid #f1f5f9;}
  button { margin-top:1rem; width:100%; padding:.75rem 1rem; background:#2563eb; color:white; border:none; border-radius:10px; font-weight:600; cursor:pointer;}
  button:hover { background:#1d4ed8;}
  .banner { margin-top: 1rem; padding: .75rem 1rem; border-radius: 10px; background: #fff7ed; color: #92400e; font-size: .875rem; border: 1px solid #fde68a;}
</style></head>
<body><div class="card">
<h1>Pactopus · Circle Checkout (sandbox webhook simulator)</h1>
<p>Local demo mode. When you click "Approve" the browser POSTS this form, and the server dispatches a signed HMAC-SHA256 internal call to <code>/api/circle/webhook</code> using the EXACT same codepath as real Circle settlements.</p>
<div class="row"><span>Session</span><span><code>${session}</code></span></div>
<div class="row"><span>Wallet</span><span><code>${wallet || '(unset)'}</code></span></div>
<div class="row"><span>Plan</span><span class="tier">${tier}</span></div>
<div class="row"><span>Amount</span><span><strong>${amount} USDC</strong> (card on-ramp → treasury via simulated webhook)</span></div>
<div class="banner">⚙️  HMAC signature produced with CIRCLE_WEBHOOK_SIGNING_SECRET when configured; otherwise a deterministic mock-HMAC header is attached so webhook structural validation still runs end-to-end through its HMAC check.</div>
<form method="POST">
<input type="hidden" name="session" value="${session}">
<input type="hidden" name="tier" value="${tier}">
<input type="hidden" name="wallet" value="${wallet}">
<button type="submit">Approve sandbox payment → simulate signed HMAC webhook → issue ${tier.toUpperCase()} tier</button>
</form>
</div></body></html>`,
    {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 200,
    }
  );
}

export async function POST(request: NextRequest) {
  if (!isLegacyArcRouteEnabled()) {
    return buildLegacyRouteDecommissionedResponse('/api/circle/mock-approve');
  }
  if (!isMockAllowed()) {
    return NextResponse.json(
      {
        error:
          'Mock flow is not enabled. The mock approval flow is available in local development only.',
      },
      { status: 404 }
    );
  }
  const form = await request.formData();
  const tier = ((form.get('tier') as string) || 'pro') as 'pro' | 'business';
  const wallet = ((form.get('wallet') as string) || '').toLowerCase();
  const sessionId = (form.get('session') as string) || `mock_sess_${Date.now()}`;

  if (!/^0x[a-f0-9]{40}$/i.test(wallet)) {
    return NextResponse.json({ error: 'Wallet must be a valid 0x EVM address.' }, { status: 400 });
  }
  if (tier !== 'pro' && tier !== 'business') {
    return NextResponse.json({ error: 'Tier must be pro or business.' }, { status: 400 });
  }
  const usdAmount = tier === 'pro' ? 15 : 50;

  const cryptoWeb = globalThis.crypto as Crypto;
  const enc = new TextEncoder();
  const now = new Date();
  const webhookPayload: Record<string, unknown> = {
    id: `evt_mock_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'checkout.session.completed',
    data: {
      id: sessionId,
      object: 'checkout.session',
      amount: { currency: 'USD', amount: String(usdAmount) },
      settlement: { currency: 'USDC' },
      paymentStatus: 'paid',
      paidAt: now.toISOString(),
      settledAt: now.toISOString(),
    },
    metadata: {
      pactopus: '1',
      wallet,
      tier,
    },
    created: Math.floor(now.getTime() / 1000),
    livemode: false,
  };
  const rawBody = JSON.stringify(webhookPayload);

  const signingSecret = process.env.CIRCLE_WEBHOOK_SIGNING_SECRET || '';
  let headerSig = 'sha256=';
  try {
    const keyBuf = await cryptoWeb.subtle.importKey(
      'raw',
      enc.encode(signingSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuf = await cryptoWeb.subtle.sign('HMAC', keyBuf, enc.encode(rawBody));
    headerSig += Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (hmacErr) {
    safeLogger.warn('[Circle:mock-approve] HMAC compute failed, attaching empty header so webhook HMAC-skip branch will validate structurally only:', hmacErr);
    headerSig += 'mock';
  }

  const webhookUrl = `${request.nextUrl.origin}/api/circle/webhook`;
  try {
    const whResp = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Circle-Signature': headerSig,
      },
      body: rawBody,
      cache: 'no-store',
    });
    const whText = await whResp.text();
    safeLogger.info(
      `[Circle:mock] internal webhook dispatch status=${whResp.status} session=${sessionId} wallet=${wallet} tier=${tier} limits=${SUBSCRIPTION_LIMITS[tier as 'pro' | 'business']}`
    );
    if (!whResp.ok) {
      safeLogger.warn(`[Circle:mock] internal webhook non-2xx: ${whText}`);
      return NextResponse.json(
        {
          error: `Webhook handler returned status ${whResp.status}`,
          details: whText.slice(0, 500),
        },
        { status: 502 }
      );
    }
  } catch (fetchErr) {
    safeLogger.error('[Circle:mock] internal webhook dispatch failed:', fetchErr);
    return NextResponse.json(
      { error: 'Internal webhook simulator dispatch failed.' },
      { status: 502 }
    );
  }

  return NextResponse.redirect(new URL(`/dashboard?upgrade=${tier}`, request.nextUrl.origin), 303);
}
