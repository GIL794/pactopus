import { NextResponse } from 'next/server';

/**
 * Legacy experimental EVM/Arc/Circle route gate.
 *
 * Per the Pactopus Solana Seeker strategic architecture:
 *  - Custodial ERC-4626 treasury yield sweeps (`/api/agent/treasury-sweep`),
 *  - ERC-4337 paymaster gas sponsorship (`/api/agent/paymaster-sponsor`),
 *  - HTTP 402 Arc nanopayment invoice creation (`/api/agent/invoice-create`), and
 *  - Circle monthly subscription card checkout (`/api/circle/*`)
 * are decommissioned by default in the non-custodial Solana Seeker Edition
 * (£0/month unlimited invoices; 0.25% capped at £5 on Seeker, 0.50% capped at £50 on Web).
 *
 * Set `PACTOPUS_ENABLE_LEGACY_ARC_ROUTES=1` only when running legacy Arc/Circle test harnesses.
 */
export function isLegacyArcRouteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const val = (env.PACTOPUS_ENABLE_LEGACY_ARC_ROUTES || '').trim().toLowerCase();
  return val === '1' || val === 'true';
}

export function buildLegacyRouteDecommissionedResponse(routeName: string): NextResponse {
  return NextResponse.json(
    {
      status: 'decommissioned',
      decommissioned: true,
      replacement: '/api/solana-pay/[id]',
      error: `Experimental endpoint ${routeName} is decommissioned in Pactopus Solana Seeker Edition.`,
      policy:
        'Pactopus operates strictly as a non-custodial Solana & Solana Seeker invoicing dApp (£0/month unlimited invoices, 0.25% capped at £5 on Seeker, 0.50% capped at £50 on Web).',
      hint: 'Set PACTOPUS_ENABLE_LEGACY_ARC_ROUTES=1 only in isolated legacy test environments.',
    },
    { status: 410 }
  );
}
