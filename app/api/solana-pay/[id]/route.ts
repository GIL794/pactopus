import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, isInvoiceExpired, updateInvoicePaymentState } from '@/lib/store';
import {
  ACTIVE_SOLANA_NETWORK,
  buildPactopusMemo,
  buildSolanaAtomicWireTransactionBase64,
  deriveAssociatedTokenAddress,
  deriveInvoiceReferencePubkey,
  isValidSolanaAddress,
  PACTOPUS_SOLANA_TREASURY,
  resolveSolanaRpcContextForPayment,
  SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID,
  SOLANA_MEMO_PROGRAM_ID,
  SOLANA_MINTS,
  SOLANA_TOKEN_PROGRAM_ID,
  splitSolanaAmount,
  normalizeFeeModel,
} from '@/lib/solana';
import { verifySeekerEligibilityServer } from '@/lib/seeker';
import { verifyWalletOwnerSignature } from '@/lib/auth-algo-server';
import { AUTH_HEADERS } from '@/lib/auth';
import { isMainnetTreasuryConfiguredSafely } from '@/lib/envguard';

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  const label = invoice?.recipientName
    ? `${invoice.recipientName} via Pactopus (Kyrvyn Ltd)`
    : 'Pactopus · Non-Custodial Solana Invoicing';
  const baseUrl = new URL(request.url).origin;

  return NextResponse.json(
    {
      label,
      icon: `${baseUrl}/logo.png`,
    },
    { headers: CORS_HEADERS }
  );
}

/**
 * Solana Pay Transaction Request Spec — Step 2 (POST)
 * Receives `{ account: "<payer_pubkey>" }` and returns a spec-compliant base64-serialized
 * Solana wire transaction `{ transaction: "<base64>", message: "..." }` along with the
 * atomic SPL settlement breakdown (99.5%/99.75% net to freelancer + 0.5% [Max £50] / 0.25% [Max £5]
 * capped fee to Kyrvyn Treasury + CreateIdempotent ATA initialization + SPL Memo + Reference key),
 * transitioning the invoice lifecycle state from `requested` -> `authorised`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (process.env.NODE_ENV === 'production' && !isMainnetTreasuryConfiguredSafely()) {
      return NextResponse.json(
        {
          error:
            'Mainnet treasury safety guardrail: NEXT_PUBLIC_SOLANA_TREASURY must be configured to a live Kyrvyn Ltd treasury wallet when NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta.',
        },
        { status: 503, headers: CORS_HEADERS }
      );
    }

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

    const rawBody = await request.text();
    let body: { account?: string } = {};
    try {
      body = rawBody ? (JSON.parse(rawBody) as { account?: string }) : {};
    } catch {
      body = {};
    }
    const payerAccount = (body.account || '').trim();
    if (!isValidSolanaAddress(payerAccount)) {
      return NextResponse.json(
        { error: 'Valid Solana Base58 payer `account` is required.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Verify Seeker eligibility on the server (hardware User-Agent, on-chain SGT, or verified invoice)
    const seekerCheck = await verifySeekerEligibilityServer({
      walletAddress: payerAccount,
      recipientAddress: invoice.recipientAddress,
      userAgent: request.headers.get('user-agent'),
    });
    const additive = normalizeFeeModel(invoice.feeModel) === 'payer-additive-v2';
    // Payer-additive invoices: the Seeker rate belongs to the payer and needs a signed request from that wallet
    // (web checkout sends one). A bare QR/wallet request has no signature, so it is quoted the standard rate.
    let signedPayerIsSeeker = false;
    if (additive && request.headers.get(AUTH_HEADERS.NETWORK)) {
      const auth = await verifyWalletOwnerSignature(request, rawBody);
      if (auth.success && auth.wallet === payerAccount) {
        const proven = await verifySeekerEligibilityServer({
          walletAddress: payerAccount,
          userAgent: request.headers.get('user-agent'),
        });
        signedPayerIsSeeker = Boolean(proven.verified);
      }
    }
    const isSeeker = additive ? signedPayerIsSeeker : Boolean(invoice.seekerVerified || seekerCheck.verified);

    const split = splitSolanaAmount(invoice.amount, {
      isSeekerVerified: isSeeker,
      currency: invoice.currency,
      gbpRate: invoice.gbpRate,
      feeModel: invoice.feeModel,
    });

    const mint = SOLANA_MINTS[invoice.currency];
    const referencePubkey = invoice.referencePubkey || deriveInvoiceReferencePubkey(invoice.id);
    const memo = invoice.memo || buildPactopusMemo(invoice.id, isSeeker ? 'seeker' : 'solana');

    const rpcCtx = await resolveSolanaRpcContextForPayment({
      payer: payerAccount,
      recipient: invoice.recipientAddress,
      treasury: PACTOPUS_SOLANA_TREASURY,
      mint,
    });

    const transactionBase64 = buildSolanaAtomicWireTransactionBase64({
      payer: payerAccount,
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

    const derivedRecipientAta =
      rpcCtx.recipientTokenAccount || deriveAssociatedTokenAddress(invoice.recipientAddress, mint);
    const derivedTreasuryAta =
      rpcCtx.treasuryTokenAccount || deriveAssociatedTokenAddress(PACTOPUS_SOLANA_TREASURY, mint);

    // Advance 6-state lifecycle to `authorised`
    await updateInvoicePaymentState(invoice.id, 'authorised');

    return NextResponse.json(
      {
        transaction: transactionBase64,
        network: ACTIVE_SOLANA_NETWORK.cluster,
        paymentState: 'authorised',
        message: additive && !isSeeker
          ? `Pay ${split.payerTotalDisplay} ${invoice.currency}: ${split.netDisplay} to ${invoice.recipientName || invoice.recipientAddress} plus a ${split.feeDisplay} ${invoice.currency} platform fee (standard 0.50%). Holding a Seeker Genesis Token? Open ${new URL(request.url).origin}/pay/${invoice.id} and sign in with that wallet for the Seeker rate.`
          : isSeeker
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
          recipientAta: derivedRecipientAta,
          treasuryAta: derivedTreasuryAta,
          createRecipientAtaIncluded: rpcCtx.createRecipientAtaIfMissing,
          createTreasuryAtaIncluded: rpcCtx.createTreasuryAtaIfMissing,
          gbpAccounting: {
            rate: split.gbpRate,
            totalGbp: split.gbpTotalDisplay,
            feeGbp: split.gbpFeeDisplay,
            netGbp: split.gbpNetDisplay,
          },
          instructions: [
            ...(rpcCtx.createRecipientAtaIfMissing
              ? [
                  {
                    programId: SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID,
                    type: 'ata-create-idempotent-recipient',
                    owner: invoice.recipientAddress,
                    ata: derivedRecipientAta,
                    mint,
                  },
                ]
              : []),
            ...(rpcCtx.createTreasuryAtaIfMissing
              ? [
                  {
                    programId: SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID,
                    type: 'ata-create-idempotent-treasury',
                    owner: PACTOPUS_SOLANA_TREASURY,
                    ata: derivedTreasuryAta,
                    mint,
                  },
                ]
              : []),
            {
              programId: SOLANA_TOKEN_PROGRAM_ID,
              type: 'spl-transfer-checked-recipient',
              mint,
              sourceOwner: payerAccount,
              destinationOwner: invoice.recipientAddress,
              destinationAta: derivedRecipientAta,
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
              destinationAta: derivedTreasuryAta,
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
