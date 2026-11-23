import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, isInvoiceExpired, updateInvoicePaymentState } from '@/lib/store';
import {
  ACTIVE_SOLANA_NETWORK,
  buildPactopusMemo,
  buildSolanaAtomicWireTransactionBase64,
  deriveInvoiceReferencePubkey,
  isValidSolanaAddress,
  PACTOPUS_SOLANA_TREASURY,
  resolveSolanaRpcContextForPayment,
  SOLANA_MINTS,
  splitSolanaAmount,
} from '@/lib/solana';
import { verifySeekerEligibilityServer } from '@/lib/seeker';

const SOLANA_CAIP2_CHAIN_ID =
  ACTIVE_SOLANA_NETWORK.cluster === 'mainnet-beta'
    ? 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
    : 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

const ACTIONS_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Action-Version, X-Blockchain-Ids',
  'Access-Control-Expose-Headers': 'X-Action-Version, X-Blockchain-Ids',
  'X-Action-Version': '2.2',
  'X-Blockchain-Ids': SOLANA_CAIP2_CHAIN_ID,
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: ACTIONS_CORS_HEADERS });
}

/**
 * Solana Actions & Blinks Specification — GET `/api/actions/pay/[id]`
 * Renders an interactive Blink card on X/Twitter, Dialect, Phantom, Backpack & Solana Seeker.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) {
    return NextResponse.json(
      { message: 'Invoice not found' },
      { status: 404, headers: ACTIONS_CORS_HEADERS }
    );
  }

  const isSeeker = Boolean(invoice.seekerVerified);
  const split = splitSolanaAmount(invoice.amount, {
    isSeekerVerified: isSeeker,
    currency: invoice.currency,
    gbpRate: invoice.gbpRate,
  });

  const disabled = invoice.status === 'paid' || isInvoiceExpired(invoice);
  const feeBadge = isSeeker
    ? `0.25% Seeker Fee (£${split.gbpFeeDisplay} · Max £5 Cap)`
    : `0.50% Standard Fee (£${split.gbpFeeDisplay} · Max £50 Cap)`;

  const baseUrl = new URL(request.url).origin;

  return NextResponse.json(
    {
      type: 'action',
      icon: `${baseUrl}/logo.png`,
      title: `Pay ${invoice.amount} ${invoice.currency} (£${split.gbpTotalDisplay}) · ${invoice.recipientName || 'Pactopus Invoice'}`,
      description: `${invoice.description} — Atomic non-custodial SPL settlement (${split.netDisplay} ${invoice.currency} direct to freelancer + ${feeBadge}). Memo: ${invoice.memo || buildPactopusMemo(invoice.id, isSeeker ? 'seeker' : 'solana')}`,
      label:
        invoice.status === 'paid'
          ? 'Already Paid ✓'
          : disabled
            ? 'Invoice Expired'
            : `Pay ${invoice.amount} ${invoice.currency} (${isSeeker ? 'Seeker 0.25%' : '0.5%'})`,
      disabled,
      links: {
        actions: [
          {
            type: 'transaction',
            label: `Pay ${invoice.amount} ${invoice.currency} (Solana Seeker 0.25% · Max £5)`,
            href: `${baseUrl}/api/actions/pay/${invoice.id}?mode=seeker`,
          },
          {
            type: 'transaction',
            label: `Pay ${invoice.amount} ${invoice.currency} (Standard Web 0.50% · Max £50)`,
            href: `${baseUrl}/api/actions/pay/${invoice.id}?mode=solana`,
          },
        ],
      },
    },
    { headers: ACTIONS_CORS_HEADERS }
  );
}

/**
 * Solana Actions & Blinks Specification — POST `/api/actions/pay/[id]`
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoice = await getInvoice(id);
    if (!invoice) {
      return NextResponse.json(
        { message: 'Invoice not found' },
        { status: 404, headers: ACTIONS_CORS_HEADERS }
      );
    }
    if (invoice.status === 'paid') {
      return NextResponse.json(
        { message: 'Invoice already settled on-chain.' },
        { status: 409, headers: ACTIONS_CORS_HEADERS }
      );
    }
    if (isInvoiceExpired(invoice)) {
      return NextResponse.json(
        { message: 'Invoice has expired.' },
        { status: 410, headers: ACTIONS_CORS_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as { account?: string };
    const payer = (body.account || '').trim();
    if (!isValidSolanaAddress(payer)) {
      return NextResponse.json(
        { message: 'Invalid Solana Base58 account in Action request.' },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }

    const requestedMode = new URL(request.url).searchParams.get('mode');
    const seekerCheck = await verifySeekerEligibilityServer({
      walletAddress: payer,
      recipientAddress: invoice.recipientAddress,
      userAgent: request.headers.get('user-agent'),
    });
    const isSeeker =
      requestedMode === 'solana'
        ? false
        : Boolean(invoice.seekerVerified || seekerCheck.verified);

    const split = splitSolanaAmount(invoice.amount, {
      isSeekerVerified: isSeeker,
      currency: invoice.currency,
      gbpRate: invoice.gbpRate,
    });

    const mint = SOLANA_MINTS[invoice.currency];
    const referencePubkey = invoice.referencePubkey || deriveInvoiceReferencePubkey(invoice.id);
    const memo = invoice.memo || buildPactopusMemo(invoice.id, isSeeker ? 'seeker' : 'solana');

    const rpcCtx = await resolveSolanaRpcContextForPayment({
      payer,
      recipient: invoice.recipientAddress,
      treasury: PACTOPUS_SOLANA_TREASURY,
      mint,
    });

    const serializedWireTransaction = buildSolanaAtomicWireTransactionBase64({
      payer,
      recipient: invoice.recipientAddress,
      treasury: PACTOPUS_SOLANA_TREASURY,
      mint,
      netUnits: split.netUnits,
      feeUnits: split.feeUnits,
      memo,
      referencePubkey,
      recentBlockhash: rpcCtx.recentBlockhash,
      payerTokenAccount: rpcCtx.payerTokenAccount,
      recipientTokenAccount: rpcCtx.recipientTokenAccount,
      treasuryTokenAccount: rpcCtx.treasuryTokenAccount,
      createRecipientAtaIfMissing: rpcCtx.createRecipientAtaIfMissing,
      createTreasuryAtaIfMissing: rpcCtx.createTreasuryAtaIfMissing,
      decimals: 6,
    });

    await updateInvoicePaymentState(invoice.id, 'authorised');

    return NextResponse.json(
      {
        type: 'transaction',
        transaction: serializedWireTransaction,
        message: `Atomic SPL settlement authorised: ${split.netDisplay} ${invoice.currency} to ${invoice.recipientName || invoice.recipientAddress} + ${split.feeDisplay} ${invoice.currency} (£${split.gbpFeeDisplay}) fee.`,
      },
      { headers: ACTIONS_CORS_HEADERS }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { message: errMsg || 'Failed to build Solana Blink transaction.' },
      { status: 500, headers: ACTIONS_CORS_HEADERS }
    );
  }
}
