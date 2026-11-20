import { verifyWalletOwnerSignature } from '@/lib/auth-algo-server';
import { verifyAlgorandPaymentGroup, algoAmountUnits } from '@/lib/algorand-payment';
import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, markInvoicePaid, isTxHashUsed, isInvoiceExpired, getSubscriptionTier } from '@/lib/store';
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

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const authResult = await verifyWalletOwnerSignature(request, rawBody);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error, authRequired: true },
        { status: authResult.status }
      );
    }
    const authenticatedWallet = authResult.wallet;
    const body: {
      invoiceId?: string;
      txHash?: string;
      feeTxHash?: string;
      payerAddress?: string;
      tier?: string;
    } = rawBody;

    // Subscription upgrade on-chain flow (USDC direct to treasury)
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

    // Standard invoice payment flow (payout + platform fee)
    if (!body.invoiceId || !body.txHash || !body.payerAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: invoiceId, txHash, payerAddress.' },
        { status: 400 }
      );
    }

    const alreadyUsed = await isTxHashUsed(body.txHash, body.invoiceId);
    if (alreadyUsed) {
      return NextResponse.json(
        { error: 'Transaction hash has already been registered for another invoice.' },
        { status: 409 }
      );
    }

    const invoice = await getInvoice(body.invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }
    if (invoice.network !== request.headers.get(AUTH_HEADERS.NETWORK)) {
      return NextResponse.json({ error: 'Wallet authentication network does not match invoice network.' }, { status: 403 });
    }
    if (invoice.status === 'paid') {
      return NextResponse.json({ status: 'already-paid', invoice }, { status: 200 });
    }
    if (isInvoiceExpired(invoice)) {
      return NextResponse.json({ error: 'Invoice has expired and can no longer be paid.' }, { status: 410 });
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
      if (authenticatedWallet.toLowerCase() !== body.payerAddress.toLowerCase()) {
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
      isVerified = await verifyAlgorandPaymentGroup(body.txHash, body.feeTxHash, {
        payer: authenticatedWallet, recipient: invoice.recipientAddress,
        assetId, amount: invoice.amount, feeBps,
      });
      if (!isVerified && feeBps !== 50) {
        // Fallback if client used standard 50 bps
        isVerified = await verifyAlgorandPaymentGroup(body.txHash, body.feeTxHash, {
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
      // Arc (EVM): verify with creator's tiered feeBps (and fallback to 50 bps if payer overpaid fee at standard 0.5%)
      const assetAddress = invoice.currency === 'USDC' ? CONTRACTS.USDC : CONTRACTS.EURC;
      isVerified = await verifyArcPayment(body.txHash, body.feeTxHash, assetAddress, invoice.recipientAddress, arcSplit!.net, arcSplit!.fee, authenticatedWallet);
      if (!isVerified && feeBps !== 50) {
        const standardSplit = splitAmount(invoice.amount, 50);
        isVerified = await verifyArcPayment(body.txHash, body.feeTxHash, assetAddress, invoice.recipientAddress, standardSplit.net, standardSplit.fee, authenticatedWallet);
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

    const payer = body.payerAddress.toLowerCase();
    const feeDisplay = invoice.network === 'algorand'
      ? `${effectiveFeeUnits / BigInt(1_000_000)}.${(effectiveFeeUnits % BigInt(1_000_000)).toString().padStart(6, '0')}`
      : ethers.formatUnits(effectiveFeeUnits, 6);
    let updatedInvoice;
    if (invoice.network === 'algorand' && prisma) {
      const changed = await prisma.invoice.updateMany({
        where: { id: body.invoiceId, network: 'algorand', status: 'pending' },
        data: { status: 'paid', txHash: body.txHash, feeTxHash: body.feeTxHash,
          paidBy: payer, fee: feeDisplay, paidAt: new Date() },
      });
      if (changed.count !== 1) {
        const current = await prisma.invoice.findUnique({ where: { id: body.invoiceId } });
        if (current?.status !== 'paid' || current.txHash !== body.txHash) {
          return NextResponse.json({ error: 'Invoice is no longer pending for this payment.' }, { status: 409 });
        }
      }
      updatedInvoice = await getInvoice(body.invoiceId);
      if (!updatedInvoice || updatedInvoice.txHash !== body.txHash) throw new Error('Settlement readback failed.');
    } else {
      updatedInvoice = await markInvoicePaid(body.invoiceId, body.txHash, payer, feeDisplay, body.feeTxHash);
    }

    return NextResponse.json({
      status: 'paid',
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
