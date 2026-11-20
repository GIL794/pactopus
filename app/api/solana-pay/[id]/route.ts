import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, isInvoiceExpired, updateInvoicePaymentState } from '@/lib/store';
import {
  ACTIVE_SOLANA_NETWORK,
  buildPactopusMemo,
  deriveInvoiceReferencePubkey,
  isValidSolanaAddress,
  PACTOPUS_SOLANA_TREASURY,
  SOLANA_MEMO_PROGRAM_ID,
  SOLANA_MINTS,
  SOLANA_TOKEN_PROGRAM_ID,
  splitSolanaAmount,
} from '@/lib/solana';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept-Encoding',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Solana Pay Transaction Request Spec — Step 1 (GET)
 * Returns the merchant label and icon to display inside Solana Mobile Wallet Adapter / Seed Vault / Phantom.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  const label = invoice?.recipientName
    ? `${invoice.recipientName} via Pactopus (Kyrvyn Ltd)`
    : 'Pactopus · Non-Custodial Solana Invoicing';

  return NextResponse.json(
    {
      label,
      icon: 'https://pactopus.kyrvynltd.co.uk/octopus-logo.png',
    },
    { headers: CORS_HEADERS }
  );
}

/**
 * Solana Pay Transaction Request Spec — Step 2 (POST)
 * Receives `{ account: "<payer_pubkey>" }` and returns the atomic SPL settlement instructions
 * (99.5%/99.75% net to freelancer + 0.5% [Max £50] / 0.25% [Max £5] capped fee to Kyrvyn Treasury + SPL Memo + Reference key)
 * and transitions the invoice lifecycle state from `requested` -> `authorised`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoice = await getInvoice(id);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404, headers: CORS_HEADERS });
    }
    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Invoice is already paid' }, { status: 409, headers: CORS_HEADERS });
    }
    if (isInvoiceExpired(invoice)) {
      return NextResponse.json({ error: 'Invoice has expired' }, { status: 410, headers: CORS_HEADERS });
    }

    const body = (await request.json().catch(() => ({}))) as {
      account?: string;
      seekerVerified?: boolean;
    };
    const payerAccount = (body.account || '').trim();
    if (!isValidSolanaAddress(payerAccount)) {
      return NextResponse.json(
        { error: 'Valid Solana Base58 payer `account` is required.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const isSeeker = Boolean(
      body.seekerVerified || invoice.seekerVerified || invoice.network === 'seeker'
    );
    const split = splitSolanaAmount(invoice.amount, {
      isSeekerVerified: isSeeker,
      currency: invoice.currency,
      gbpRate: invoice.gbpRate,
    });

    const mint = SOLANA_MINTS[invoice.currency];
    const referencePubkey = invoice.referencePubkey || deriveInvoiceReferencePubkey(invoice.id);
    const memo = invoice.memo || buildPactopusMemo(invoice.id, isSeeker ? 'seeker' : 'solana');

    // Advance 6-state lifecycle to `authorised`
    await updateInvoicePaymentState(invoice.id, 'authorised');

    return NextResponse.json(
      {
        network: ACTIVE_SOLANA_NETWORK.cluster,
        paymentState: 'authorised',
        message: isSeeker
          ? `Solana Seeker Hardware Verified (0.25% · Max £5 cap): Pay ${split.netDisplay} ${invoice.currency} to ${invoice.recipientName || invoice.recipientAddress} + ${split.feeDisplay} ${invoice.currency} (£${split.gbpFeeDisplay}) fee.`
          : `Solana Standard Web (0.50% · Max £50 cap): Pay ${split.netDisplay} ${invoice.currency} to ${invoice.recipientName || invoice.recipientAddress} + ${split.feeDisplay} ${invoice.currency} (£${split.gbpFeeDisplay}) fee.`,
        atomicSettlementPlan: {
          invoiceId: invoice.id,
          payer: payerAccount,
          mint,
          currency: invoice.currency,
          decimals: 6,
          totalUnits: split.totalUnits.toString(),
          netUnits: split.netUnits.toString(),
          feeUnits: split.feeUnits.toString(),
          totalDisplay: split.totalDisplay,
          netDisplay: split.netDisplay,
          feeDisplay: split.feeDisplay,
          feeBps: split.feeBps,
          maxCapGbp: split.maxCapGbp,
          capApplied: split.capApplied,
          isSeekerVerified: isSeeker,
          gbpAccounting: {
            rate: split.gbpRate,
            totalGbp: split.gbpTotalDisplay,
            feeGbp: split.gbpFeeDisplay,
            netGbp: split.gbpNetDisplay,
          },
          instructions: [
            {
              programId: SOLANA_TOKEN_PROGRAM_ID,
              type: 'spl-transfer-checked-recipient',
              mint,
              sourceOwner: payerAccount,
              destinationOwner: invoice.recipientAddress,
              amountUnits: split.netUnits.toString(),
              amountDisplay: split.netDisplay,
              referencePubkey,
            },
            {
              programId: SOLANA_TOKEN_PROGRAM_ID,
              type: 'spl-transfer-checked-fee',
              mint,
              sourceOwner: payerAccount,
              destinationOwner: PACTOPUS_SOLANA_TREASURY,
              amountUnits: split.feeUnits.toString(),
              amountDisplay: split.feeDisplay,
            },
            {
              programId: SOLANA_MEMO_PROGRAM_ID,
              type: 'spl-memo',
              memo,
              referencePubkey,
            },
          ],
        },
      },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: errMsg || 'Failed to build Solana Pay transaction request' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
