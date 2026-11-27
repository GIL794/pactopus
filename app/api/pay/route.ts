import { verifyWalletOwnerSignature } from '@/lib/auth-algo-server';
import { verifyAlgorandPaymentGroup, algoAmountUnits } from '@/lib/algorand-payment';
import { findSolanaSignatureByReference, verifySolanaPaymentOnChain } from '@/lib/solana-payment';
import {
  buildPactopusMemo,
  deriveInvoiceReferencePubkey,
  isValidSolanaSignature,
  splitSolanaAmount,
  normalizeFeeModel,
} from '@/lib/solana';
import { verifySeekerEligibilityServer } from '@/lib/seeker';
import { NextRequest, NextResponse } from 'next/server';
import {
  getInvoice,
  markInvoicePaid,
  isTxHashUsed,
  isInvoiceExpired,
  getSubscriptionTier,
  updateInvoicePaymentState,
} from '@/lib/store';
import { CONTRACTS, PLATFORM_WALLET } from '@/lib/arc';
import { ethers } from 'ethers';
import { prisma, isCloudDbEnabled } from '@/lib/db';
import { safeLogger } from '@/lib/log-redact';
import { AUTH_HEADERS } from '@/lib/auth';
import { rateLimitForSubscriptionUpgrade } from '@/lib/rate-limit';
import { SUBSCRIPTION_LIMITS, getFeeBpsForTier } from '@/lib/billing';
import { splitAmount, isTxHash, verifyInvoiceSettlement } from '@/lib/arc-settlement';

const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://testnet.arc.eco/rpc';

async function verifyArcPayment(
  payoutTxHash: string,
  feeTxHash: string | undefined,
  expectedAsset: string,
  expectedRecipient: string,
  expectedNetAmount: bigint,
  expectedFeeAmount: bigint,
  payer: string
): Promise<boolean> {
  if (!isTxHash(payoutTxHash)) return false;
  const timeoutMs = 15_000;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const rpcWork = (async () => {
    try {
      const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
      const payout = await provider.getTransactionReceipt(payoutTxHash);
      const fee = expectedFeeAmount > BigInt(0) && isTxHash(feeTxHash) ? await provider.getTransactionReceipt(feeTxHash) : null;
      return verifyInvoiceSettlement({
        payout, fee, payoutTxHash, feeTxHash,
        asset: expectedAsset, recipient: expectedRecipient, platform: PLATFORM_WALLET, payer,
        net: expectedNetAmount, feeUnits: expectedFeeAmount,
      });
    } catch (err) {
      safeLogger.error('Arc transaction verification error:', err);
      return false;
    }
  })();
  const timeoutPromise = new Promise<boolean>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Arc RPC timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([rpcWork, timeoutPromise]);
  } catch (err) {
    safeLogger.warn('Arc verify timed out or aborted, returning unverified for safety:', err instanceof Error ? err.message : String(err));
    return false;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function handleSubscriptionUpgrade(body: {
  tier: string;
  txHash: string;
  payerAddress?: string;
}, authenticatedWallet: string): Promise<NextResponse> {
  const tierNormalized =
    body.tier === 'pro' || body.tier === 'business' ? body.tier : null;
  if (!tierNormalized) {
    return NextResponse.json({ error: 'Upgrade tier must be pro or business.' }, { status: 400 });
  }
  const payer = (body.payerAddress || authenticatedWallet).toLowerCase();
  if (payer !== authenticatedWallet) {
    return NextResponse.json(
      { error: 'Payer address does not match authenticated signing wallet.' },
      { status: 403 }
    );
  }
  const planAmount = tierNormalized === 'pro' ? 15 : 50;
  const expectedAmountRaw = BigInt(planAmount * 1_000_000);
  if (!isTxHash(body.txHash)) {
    return NextResponse.json({ error: 'Invalid transaction hash.' }, { status: 400 });
  }
  if (isCloudDbEnabled && prisma) {
    const reused = await prisma.subscription.findFirst({ where: { txHash: body.txHash, NOT: { address: authenticatedWallet } } });
    if (reused || (await isTxHashUsed(body.txHash))) {
      return NextResponse.json({ error: 'This transaction was already used.' }, { status: 409 });
    }
  }
  const isVerified = await verifyArcPayment(
    body.txHash,
    undefined,
    CONTRACTS.USDC,
    PLATFORM_WALLET,
    expectedAmountRaw,
    BigInt(0),
    authenticatedWallet
  );
  if (!isVerified) {
    return NextResponse.json(
      { error: 'Upgrade payment verification failed on Arc chain.' },
      { status: 402 }
    );
  }
  if (isCloudDbEnabled && prisma) {
    await prisma.subscription.upsert({
      where: { address: authenticatedWallet },
      update: { tier: tierNormalized, txHash: body.txHash, updatedAt: new Date(), sessionId: null },
      create: { address: authenticatedWallet, tier: tierNormalized, txHash: body.txHash, sessionId: null },
    });
    safeLogger.info(`[Subs:onchain] upserted tier=${tierNormalized} wallet=${authenticatedWallet} tx=${body.txHash}`);
  }
  return NextResponse.json({
    status: 'upgraded',
    tier: tierNormalized,
    txHash: body.txHash,
    limits: { invoicesPerMonth: SUBSCRIPTION_LIMITS[tierNormalized] },
  });
}

function networksCompatible(invoiceNet: string, headerNet: string | null): boolean {
  if (!headerNet) return false;
  if (invoiceNet === headerNet) return true;
  if (
    (invoiceNet === 'solana' || invoiceNet === 'seeker') &&
    (headerNet === 'solana' || headerNet === 'seeker')
  ) {
    return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const body: {
      invoiceId?: string;
      txHash?: string;
      feeTxHash?: string;
      payerAddress?: string;
      tier?: string;
      recoverByReference?: boolean;
      seekerVerified?: boolean;
    } = rawBody;

    const authResult = await verifyWalletOwnerSignature(request, rawBody);

    // Allow unauthenticated on-chain Solana reference-key / signature recovery
    // when a payer scanned a Solana Pay QR code from a separate mobile wallet
    // or closed their browser tab mid-settlement. All transfers, memo, and reference
    // public key are cryptographically verified directly against the Solana RPC.
    const isUnauthenticatedSolanaRecovery =
      !authResult.success &&
      Boolean(body.invoiceId) &&
      !body.tier &&
      Boolean(body.recoverByReference || (body.txHash && isValidSolanaSignature(body.txHash)));

    if (!authResult.success && !isUnauthenticatedSolanaRecovery) {
      return NextResponse.json(
        { error: authResult.error, authRequired: true },
        { status: authResult.status }
      );
    }

    const authenticatedWallet = authResult.success ? authResult.wallet : '';

    // Subscription upgrade on-chain flow (legacy Arc compatibility)
    if (body.tier && body.txHash) {
      if (request.headers.get(AUTH_HEADERS.NETWORK) !== 'arc') return NextResponse.json({ error: 'On-chain subscriptions require Arc.' }, { status: 403 });
      const rl = await rateLimitForSubscriptionUpgrade(request, authenticatedWallet);
      if (!rl.ok) {
        return NextResponse.json(
          { error: `Upgrade rate-limit reached. Retry in ${rl.retryAfterSeconds}s.` },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
        );
      }
      return handleSubscriptionUpgrade(
        { tier: body.tier, txHash: body.txHash, payerAddress: body.payerAddress },
        authenticatedWallet
      );
    }

    if (!body.invoiceId) {
      return NextResponse.json(
        { error: 'Missing required fields: invoiceId, payerAddress.' },
        { status: 400 }
      );
    }

    const invoice = await getInvoice(body.invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    const isSolanaFamily = invoice.network === 'solana' || invoice.network === 'seeker';

    if (!isSolanaFamily && !authResult.success) {
      return NextResponse.json(
        { error: authResult.error, authRequired: true },
        { status: authResult.status }
      );
    }

    if (authResult.success && !networksCompatible(invoice.network, request.headers.get(AUTH_HEADERS.NETWORK))) {
      return NextResponse.json({ error: 'Wallet authentication network does not match invoice network.' }, { status: 403 });
    }

    if (!isSolanaFamily && !body.payerAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: invoiceId, payerAddress.' },
        { status: 400 }
      );
    }

    if (invoice.status === 'paid') {
      return NextResponse.json({ status: 'already-paid', invoice, paymentState: 'accounted' }, { status: 200 });
    }
    if (isInvoiceExpired(invoice)) {
      return NextResponse.json({ error: 'Invoice has expired and can no longer be paid.' }, { status: 410 });
    }

    // Solana / Seeker reference-key recovery when browser tab was interrupted or paid via mobile QR
    let resolvedTxHash = body.txHash;
    if (isSolanaFamily && !resolvedTxHash && body.recoverByReference) {
      const refKey = invoice.referencePubkey || deriveInvoiceReferencePubkey(invoice.id);
      const foundSig = await findSolanaSignatureByReference(refKey);
      if (!foundSig) {
        return NextResponse.json(
          {
            error: 'No settled Solana transaction found yet for this invoice reference key.',
            paymentState: invoice.paymentState || 'requested',
            referencePubkey: refKey,
          },
          { status: 404 }
        );
      }
      resolvedTxHash = foundSig;
    }

    if (!resolvedTxHash) {
      return NextResponse.json(
        { error: 'Missing required field: txHash (or set recoverByReference: true for Solana reference recovery).' },
        { status: 400 }
      );
    }

    const alreadyUsed = await isTxHashUsed(resolvedTxHash, body.invoiceId);
    if (alreadyUsed) {
      return NextResponse.json(
        { error: 'Transaction hash has already been registered for another invoice.' },
        { status: 409 }
      );
    }

    if (isSolanaFamily) {
      if (authResult.success && body.payerAddress && authenticatedWallet !== body.payerAddress) {
        return NextResponse.json({ error: 'Payer does not match authenticated Solana wallet.' }, { status: 403 });
      }
      if (!isValidSolanaSignature(resolvedTxHash)) {
        return NextResponse.json({ error: 'Invalid Solana Base58 transaction signature.' }, { status: 400 });
      }

      await updateInvoicePaymentState(invoice.id, 'submitted');

      const candidatePayer = authenticatedWallet || body.payerAddress || '';
      const additive = normalizeFeeModel(invoice.feeModel) === 'payer-additive-v2';
      // Payer-additive invoices: the Seeker rate is only considered for the AUTHENTICATED payer wallet.
      // An address typed into the request body is never enough.
      const seekerCandidate = additive ? authenticatedWallet || '' : candidatePayer;
      const payerSeekerCheck = seekerCandidate
        ? await verifySeekerEligibilityServer({
            walletAddress: seekerCandidate,
            userAgent: request.headers.get('user-agent'),
          })
        : { isEligible: false };

      const isSeeker = additive
        ? Boolean(payerSeekerCheck.isEligible)
        : Boolean(invoice.seekerVerified || payerSeekerCheck.isEligible);

      const solSplit = splitSolanaAmount(invoice.amount, {
        isSeekerVerified: isSeeker,
        currency: invoice.currency,
        gbpRate: invoice.gbpRate,
        feeModel: invoice.feeModel,
      });

      const verification = await verifySolanaPaymentOnChain({
        signature: resolvedTxHash,
        invoiceId: invoice.id,
        payer: candidatePayer,
        recipient: invoice.recipientAddress,
        currency: invoice.currency,
        amount: invoice.amount,
        isSeekerVerified: isSeeker,
        feeModel: invoice.feeModel,
        gbpRate: invoice.gbpRate,
        expectedMemo: invoice.memo || buildPactopusMemo(invoice.id, isSeeker ? 'seeker' : 'solana'),
        expectedReferencePubkey: invoice.referencePubkey || deriveInvoiceReferencePubkey(invoice.id),
      });

      if (!verification.verified) {
        await updateInvoicePaymentState(invoice.id, verification.state);
        return NextResponse.json(
          {
            error: verification.discrepancyReason || 'Solana atomic SPL settlement verification failed on-chain.',
            paymentState: verification.state,
          },
          { status: 402 }
        );
      }

      const effectiveSplit = verification.split || solSplit;
      const recordedPayer = verification.onChainPayer || candidatePayer || 'solana-pay-qr-payer';
      const updatedInvoice = await markInvoicePaid(
        invoice.id,
        resolvedTxHash,
        recordedPayer,
        effectiveSplit.feeDisplay,
        resolvedTxHash
      );

      return NextResponse.json({
        status: 'paid',
        paymentState: 'accounted',
        invoice: updatedInvoice,
        fee: effectiveSplit.feeDisplay,
        feeBps: effectiveSplit.feeBps,
        maxCapGbp: effectiveSplit.maxCapGbp,
        capApplied: effectiveSplit.capApplied,
        seekerVerified: effectiveSplit.feeBps === 25,
        gbpAccounting: {
          rate: effectiveSplit.gbpRate,
          totalGbp: effectiveSplit.gbpTotalDisplay,
          feeGbp: effectiveSplit.gbpFeeDisplay,
          netGbp: effectiveSplit.gbpNetDisplay,
        },
        message: `Atomic Solana SPL payment of ${invoice.amount} ${invoice.currency} (£${effectiveSplit.gbpTotalDisplay}) verified & accounted (${effectiveSplit.feeBps === 25 ? 'Seeker 0.25% · Max £5' : 'Standard 0.50% · Max £50'}).`,
      });
    }

    const ownerForTier = invoice.ownerAddress && !invoice.isSystem ? invoice.ownerAddress : invoice.recipientAddress;
    const creatorTier = await getSubscriptionTier(ownerForTier);
    const feeBps = getFeeBpsForTier(creatorTier);

    let arcSplit: { total: bigint; fee: bigint; net: bigint } | null = null;
    if (invoice.network !== 'algorand') {
      try { arcSplit = splitAmount(invoice.amount, feeBps); } catch {
        return NextResponse.json({ error: 'Invoice amount is not a valid token amount.' }, { status: 400 });
      }
      if (arcSplit.fee > BigInt(0) && !isTxHash(body.feeTxHash)) {
        return NextResponse.json({ error: 'Arc payout and fee transaction hashes are required.' }, { status: 400 });
      }
      if (authenticatedWallet.toLowerCase() !== body.payerAddress!.toLowerCase()) {
        return NextResponse.json({ error: 'Payer does not match authenticated wallet.' }, { status: 403 });
      }
      if (body.feeTxHash && (await isTxHashUsed(body.feeTxHash, body.invoiceId))) {
        return NextResponse.json({ error: 'Fee transaction hash has already been registered.' }, { status: 409 });
      }
    }

    let isVerified = false;
    let effectiveFeeUnits: bigint = arcSplit?.fee ?? BigInt(0);

    if (invoice.network === 'algorand') {
      if (!body.feeTxHash || !body.payerAddress) {
        return NextResponse.json({ error: 'Algorand payout and fee transaction IDs are required.' }, { status: 400 });
      }
      const assetId = invoice.currency === 'USDC' ? 10458941 : 230190169;
      if (authenticatedWallet !== body.payerAddress) {
        return NextResponse.json({ error: 'Payer does not match authenticated wallet.' }, { status: 403 });
      }
      isVerified = await verifyAlgorandPaymentGroup(resolvedTxHash, body.feeTxHash, {
        payer: authenticatedWallet, recipient: invoice.recipientAddress,
        assetId, amount: invoice.amount, feeBps,
      });
      if (!isVerified && feeBps !== 50) {
        isVerified = await verifyAlgorandPaymentGroup(resolvedTxHash, body.feeTxHash, {
          payer: authenticatedWallet, recipient: invoice.recipientAddress,
          assetId, amount: invoice.amount, feeBps: 50,
        });
        if (isVerified) {
          effectiveFeeUnits = (algoAmountUnits(invoice.amount) * BigInt(50)) / BigInt(10000);
        }
      } else {
        effectiveFeeUnits = (algoAmountUnits(invoice.amount) * BigInt(feeBps)) / BigInt(10000);
      }
    } else {
      const assetAddress = invoice.currency === 'USDC' ? CONTRACTS.USDC : CONTRACTS.EURC;
      isVerified = await verifyArcPayment(resolvedTxHash, body.feeTxHash, assetAddress, invoice.recipientAddress, arcSplit!.net, arcSplit!.fee, authenticatedWallet);
      if (!isVerified && feeBps !== 50) {
        const standardSplit = splitAmount(invoice.amount, 50);
        isVerified = await verifyArcPayment(resolvedTxHash, body.feeTxHash, assetAddress, invoice.recipientAddress, standardSplit.net, standardSplit.fee, authenticatedWallet);
        if (isVerified) {
          effectiveFeeUnits = standardSplit.fee;
        }
      }
    }

    if (!isVerified) {
      return NextResponse.json(
        { error: 'Payment transaction verification failed on-chain.' },
        { status: 402 }
      );
    }

    if (invoice.network === 'algorand' && (!isCloudDbEnabled || !prisma)) {
      return NextResponse.json({ error: 'Persistent settlement storage unavailable.' }, { status: 503 });
    }

    const payer = body.payerAddress!.toLowerCase();
    const feeDisplay = invoice.network === 'algorand'
      ? `${effectiveFeeUnits / BigInt(1_000_000)}.${(effectiveFeeUnits % BigInt(1_000_000)).toString().padStart(6, '0')}`
      : ethers.formatUnits(effectiveFeeUnits, 6);
    let updatedInvoice;
    if (invoice.network === 'algorand' && prisma) {
      const changed = await prisma.invoice.updateMany({
        where: { id: body.invoiceId, network: 'algorand', status: 'pending' },
        data: { status: 'paid', txHash: resolvedTxHash, feeTxHash: body.feeTxHash,
          paidBy: payer, fee: feeDisplay, paidAt: new Date() },
      });
      if (changed.count !== 1) {
        const current = await prisma.invoice.findUnique({ where: { id: body.invoiceId } });
        if (current?.status !== 'paid' || current.txHash !== resolvedTxHash) {
          return NextResponse.json({ error: 'Invoice is no longer pending for this payment.' }, { status: 409 });
        }
      }
      updatedInvoice = await getInvoice(body.invoiceId);
      if (!updatedInvoice || updatedInvoice.txHash !== resolvedTxHash) throw new Error('Settlement readback failed.');
    } else {
      updatedInvoice = await markInvoicePaid(body.invoiceId, resolvedTxHash, payer, feeDisplay, body.feeTxHash);
    }

    return NextResponse.json({
      status: 'paid',
      paymentState: 'accounted',
      invoice: updatedInvoice,
      fee: feeDisplay,
      feeBps,
      message: `Payment of ${invoice.amount} ${invoice.currency} verified on-chain on ${invoice.network === 'algorand' ? 'Algorand' : 'Arc'}.`,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    safeLogger.error('[API:pay:POST] failed:', err);
    return NextResponse.json(
      { error: errMsg || 'Payment processing failed.' },
      { status: 500 }
    );
  }
}
