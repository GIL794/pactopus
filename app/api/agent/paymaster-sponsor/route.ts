import { NextRequest, NextResponse } from 'next/server';
import { sponsorGasForUserOp } from '@/lib/paymaster-kit';
import { AgentPaymasterSponsorZ, safeParse } from '@/lib/schemas';
import { authorizeAdminRequest } from '@/lib/admin-auth';
import { isLegacyArcRouteEnabled, buildLegacyRouteDecommissionedResponse } from '@/lib/legacy-route-gate';
import { safeLogger } from '@/lib/log-redact';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!isLegacyArcRouteEnabled()) {
    return buildLegacyRouteDecommissionedResponse('/api/agent/paymaster-sponsor');
  }
  const auth = authorizeAdminRequest(request.headers.get('authorization'), process.env.AGENT_ADMIN_TOKEN);
  if (!auth.ok) return NextResponse.json({ status: 'error', error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();

    const parsed = safeParse(AgentPaymasterSponsorZ, {
      ...body,
      nonce: body.nonce ?? 0,
      callGasLimit: body.callGasLimit ?? 200_000,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { status: 'error', error: 'Invalid payload', issues: parsed.issues },
        { status: 400 }
      );
    }
    const { sender, nonce, callData, callGasLimit, description } = parsed.data;

    const sponsorship = await sponsorGasForUserOp({
      sender,
      nonce,
      callData,
      callGasLimit,
      description,
    });

    return NextResponse.json(
      {
        status: 'sponsored',
        paymasterAndData: sponsorship.paymasterAndData,
        allowanceRemaining: sponsorship.allowanceRemaining,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    safeLogger.warn('[PaymasterSponsor] Failed:', err);
    const statusCode =
      errMsg.toLowerCase().includes('rate limit') ? 429 :
      errMsg.toLowerCase().includes('insufficient') || errMsg.toLowerCase().includes('allowance') ? 402 :
      500;

    return NextResponse.json(
      {
        status: 'error',
        error: errMsg || 'Paymaster sponsorship failed',
      },
      { status: statusCode }
    );
  }
}
