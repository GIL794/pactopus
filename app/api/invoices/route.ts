import { verifyWalletOwnerSignature } from '@/lib/auth-algo-server';
import { normalizeInvoiceAmount } from '@/lib/amount';
import { NextRequest, NextResponse } from 'next/server';
import { createInvoice, getDashboardStats, type SupportedNetworkId } from '@/lib/store';
import type { Currency } from '@/lib/arc';
import { isValidAlgorandAddress } from '@/lib/algo';
import { fetchLiveGbpRates, isValidSolanaAddress } from '@/lib/solana';
import { verifySeekerEligibilityServer } from '@/lib/seeker';
import { safeLogger } from '@/lib/log-redact';
import { CreateInvoiceRequestZ, safeParse } from '@/lib/schemas';
import { AUTH_HEADERS } from '@/lib/auth';
import { applyRateLimit, RL_BUCKET_KEY_INVOICES } from '@/lib/rate-limit';

async function resolveAuthenticatedOwner(
  request: NextRequest,
  rawBody: Record<string, unknown> | null,
  options?: { required?: boolean }
): Promise<{ wallet: string; errorResponse?: NextResponse }> {
  const result = await verifyWalletOwnerSignature(request, rawBody);
  if (result.success) return { wallet: result.wallet };
  if (options?.required === false) return { wallet: '' };
  safeLogger.warn('[API:invoices] Auth failed', { path: request.nextUrl.pathname, error: result.error });
  return {
    wallet: '',
    errorResponse: NextResponse.json(
      { error: result.error, authRequired: true },
      { status: result.status }
    ),
  };
}

function networksMatch(invoiceNetwork: string, headerNetwork: string | null): boolean {
  if (!headerNetwork) return false;
  if (invoiceNetwork === headerNetwork) return true;
  if (
    (invoiceNetwork === 'solana' || invoiceNetwork === 'seeker') &&
    (headerNetwork === 'solana' || headerNetwork === 'seeker')
  ) {
    return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();

    // Verify wallet signature BEFORE consuming wallet-scoped rate limit quota
    // so an unauthenticated attacker cannot DoS another user's wallet bucket.
    const { wallet, errorResponse } = await resolveAuthenticatedOwner(request, rawBody as Record<string, unknown>, { required: true });
    if (errorResponse) return errorResponse;

    const rlIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const rl = await applyRateLimit([`${RL_BUCKET_KEY_INVOICES}:wallet:${wallet}`, `${RL_BUCKET_KEY_INVOICES}:ip:${rlIp}`]);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Rate limit reached. Try again in ${rl.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const parsed = safeParse(CreateInvoiceRequestZ, rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.issues },
        { status: 400 }
      );
    }

    const {
      amount,
      currency,
      description,
      recipientAddress: rawRecipient,
      recipientName,
      network,
      gbpRate,
      expiresAt,
    } = parsed.data;

    const headerNet = request.headers.get(AUTH_HEADERS.NETWORK);
    if (!networksMatch(network, headerNet)) {
      return NextResponse.json({ error: 'Wallet authentication network does not match invoice network.' }, { status: 403 });
    }
    let normalizedAmount: string;
    try {
      normalizedAmount = normalizeInvoiceAmount(amount);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid amount.' }, { status: 400 });
    }
    if (network === 'algorand' && (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(amount) || Number(amount) < 0.002)) {
      return NextResponse.json({ error: 'Algorand amount must be at least 0.002 with at most six decimals.' }, { status: 400 });
    }
    if (network === 'algorand' && !isValidAlgorandAddress(rawRecipient)) {
      return NextResponse.json(
        { error: 'Invalid Algorand wallet address (must be 58 uppercase base32 characters)' },
        { status: 400 }
      );
    }
    if ((network === 'solana' || network === 'seeker') && !isValidSolanaAddress(rawRecipient)) {
      return NextResponse.json(
        { error: 'Invalid Solana Base58 wallet address (must be 32-byte Ed25519 public key)' },
        { status: 400 }
      );
    }

    const recipientAddress =
      network === 'arc'
        ? rawRecipient.toLowerCase()
        : network === 'algorand'
          ? rawRecipient.toUpperCase()
          : rawRecipient.trim();

    // Verify Solana Seeker eligibility server-side via User-Agent or on-chain Seeker Genesis / Chapter 2 Token
    // so non-Seeker desktop browsers previewing the Seeker Chameleon theme cannot spoof the 0.25% fee tier.
    let isSeekerVerified = false;
    let resolvedGbpRate = gbpRate;
    if (network === 'solana' || network === 'seeker') {
      const [seekerCheck, liveFx] = await Promise.all([
        verifySeekerEligibilityServer({
          walletAddress: wallet,
          userAgent: request.headers.get('user-agent'),
        }),
        typeof gbpRate === 'number' && gbpRate > 0 ? Promise.resolve(null) : fetchLiveGbpRates(),
      ]);
      isSeekerVerified = seekerCheck.isEligible;
      if (!resolvedGbpRate && liveFx) {
        resolvedGbpRate = currency === 'EURC' ? liveFx.EURC : liveFx.USDC;
      }
    }

    const effectiveNetwork: SupportedNetworkId =
      network === 'seeker' && !isSeekerVerified ? 'solana' : network;

    safeLogger.info(
      `[API:invoices:POST] create owner=${wallet} network=${effectiveNetwork} seeker=${isSeekerVerified} amount=${amount} currency=${currency} gbpRate=${resolvedGbpRate}`
    );

    const invoice = await createInvoice({
      ownerAddress: wallet,
      amount: normalizedAmount,
      currency: currency as Currency,
      description: (description ?? '').trim() || '(no description)',
      recipientAddress,
      recipientName: (recipientName ?? '').trim() || undefined,
      network: effectiveNetwork,
      seekerVerified: isSeekerVerified,
      gbpRate: resolvedGbpRate,
      expiresAt,
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    safeLogger.warn(`[API:invoices:POST] failed: ${errMsg}`, err);
    const isLimitErr = /invoices.*month.*reached|limit of \d+ invoices/i.test(errMsg);
    return NextResponse.json(
      { error: errMsg || 'Failed to create invoice', limitReached: isLimitErr },
      { status: isLimitErr ? 402 : 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const network = (searchParams.get('network') as SupportedNetworkId) || 'solana';
    const { wallet, errorResponse } = await resolveAuthenticatedOwner(request, null, { required: false });
    if (errorResponse) return errorResponse;
    safeLogger.info(
      `[API:invoices:GET] dashboard owner=${wallet || '(public-anonymous)'} network=${network}`
    );
    const stats = await getDashboardStats(network, wallet);
    return NextResponse.json(stats);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    safeLogger.warn(`[API:invoices:GET] failed: ${errMsg}`, err);
    return NextResponse.json(
      { error: errMsg || 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
