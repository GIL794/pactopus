import { verifyWalletOwnerSignature } from '@/lib/auth-algo-server';
import { verifyAlgorandPaymentGroup, algoAmountUnits } from '@/lib/algorand-payment';
import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, markInvoicePaid, isTxHashUsed } from '@/lib/store';
import { CONTRACTS, PLATFORM_WALLET } from '@/lib/arc';
import { ethers } from 'ethers';
import { prisma, isCloudDbEnabled } from '@/lib/db';
import { safeLogger } from '@/lib/log-redact';
import { AUTH_HEADERS } from '@/lib/auth';
import { rateLimitForSubscriptionUpgrade } from '@/lib/rate-limit';
import { SUBSCRIPTION_LIMITS } from '@/lib/billing';

const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://testnet.arc.eco/rpc';

// Server-side Arc EVM on-chain verification for both Payout and Fee split receipts
async function verifyArcPayment(
  payoutTxHash: string,
  feeTxHash: string | undefined,
  expectedAsset: string,
  expectedRecipient: string,
  expectedNetAmount: bigint,
  expectedFeeAmount: bigint
): Promise<boolean> {
  const controller = new AbortController();
  const timeoutMs = 15_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const rpcWork = (async () => {
    try {
      const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);

      // 1. Verify payout transaction receipt
      const payoutReceipt = await provider.getTransactionReceipt(payoutTxHash);
      if (!payoutReceipt || payoutReceipt.status !== 1) {
        safeLogger.warn('Verify failed: Payout tx not found or failed on Arc');
        return false;
      }

      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      let verifiedPayout = false;

      for (const log of payoutReceipt.logs) {
        if (log.address.toLowerCase() !== expectedAsset.toLowerCase()) continue;
        if (log.topics[0] !== transferTopic) continue;

        const toHex = log.topics[2];
        if (!toHex) continue;

        const recipientAddress = '0x' + toHex.slice(26).toLowerCase();
        const value = BigInt(log.data);

        if (recipientAddress === expectedRecipient.toLowerCase() && value >= expectedNetAmount) {
          verifiedPayout = true;
        }
      }

      // If no fee expected (e.g. subscription upgrade direct payment), return payout status
      if (expectedFeeAmount === BigInt(0) || !feeTxHash) {
        return verifiedPayout;
      }

      // 2. Verify platform fee transaction receipt
      const feeReceipt = await provider.getTransactionReceipt(feeTxHash);
      if (!feeReceipt || feeReceipt.status !== 1) {
        safeLogger.warn('Verify failed: Fee tx not found or failed on Arc');
        return false;
      }

      let verifiedFee = false;

      for (const log of feeReceipt.logs) {
        if (log.address.toLowerCase() !== expectedAsset.toLowerCase()) continue;
        if (log.topics[0] !== transferTopic) continue;

        const toHex = log.topics[2];
        if (!toHex) continue;

        const recipientAddress = '0x' + toHex.slice(26).toLowerCase();
        const value = BigInt(log.data);

        if (recipientAddress === PLATFORM_WALLET.toLowerCase() && value >= expectedFeeAmount) {
          verifiedFee = true;
        }
      }

      return verifiedPayout && verifiedFee;
    } catch (err) {
      safeLogger.error('Arc transaction verification error:', err);
      return false;
    }
  })();
  const timeoutPromise = new Promise<boolean>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error(`Arc RPC timed out after ${timeoutMs}ms`)));
  });
  try {
    return await Promise.race([rpcWork, timeoutPromise]);
  } catch (err) {
    safeLogger.warn('Arc verify timed out or aborted — returning unverified for safety:', err instanceof Error ? err.message : String(err));
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * P3 SUBSCRIPTION UPGRADE — on-chain USDC flow.
 *
 * This closes the bug identified in the production audit: `verifyArcPayment`
 * validated the 15/50 USDC was paid to PLATFORM_WALLET but then returned
 * `{status:paid}` and never wrote to Prisma Subscription → user was still
 * on 'free' tier forever. This method now:
 *   1. authenticates the caller via EVM signature (wallet signed the request).
 *   2. rate-limits upgrade attempts (RL_DAILY_WALLET_UPGRADE_LIMIT = 5 / day).
 *   3. verifies on-chain USDC transfer exactly = planAmount to PLATFORM_WALLET.
 *   4. **writes the subscription row via prisma.subscription.upsert** so
 *      getSubscriptionTier picks it up on the NEXT getMonthlyUsage call —
 *      that's the previously missing write.
 */
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
  const isVerified = await verifyArcPayment(
    body.txHash,
    undefined,
    CONTRACTS.USDC,
    PLATFORM_WALLET,
    expectedAmountRaw,
    BigInt(0)
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

    // Double-spend protection: check if this txHash was already used on another invoice
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

    const amountVal = parseFloat(invoice.amount);
    const feeVal = (amountVal * 0.005).toFixed(2);
    const netVal = amountVal - parseFloat(feeVal);

    let isVerified = false;

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
        assetId, amount: invoice.amount,
      });
    } else {
      // Arc (EVM)
      const assetAddress = invoice.currency === 'USDC' ? CONTRACTS.USDC : CONTRACTS.EURC;
      const expectedNetUnits = ethers.parseUnits(netVal.toFixed(6), 6);
      const expectedFeeUnits = ethers.parseUnits(parseFloat(feeVal).toFixed(6), 6);
      isVerified = await verifyArcPayment(body.txHash, body.feeTxHash, assetAddress, invoice.recipientAddress, expectedNetUnits, expectedFeeUnits);
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

    // Mark invoice as paid once verified on-chain
    const payer = body.payerAddress.toLowerCase();
    const feeDisplay = invoice.network === 'algorand'
      ? (() => { const raw = algoAmountUnits(invoice.amount) * BigInt(50) / BigInt(10000); return `${raw / BigInt(1_000_000)}.${(raw % BigInt(1_000_000)).toString().padStart(6, '0')}`; })()
      : feeVal;
    let updatedInvoice;
    if (invoice.network === 'algorand' && prisma) {
      // Conditional update plus Invoice.txHash UNIQUE serializes concurrent claims
      // against both the same invoice and a second invoice using this group.
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
