import { NextRequest, NextResponse } from 'next/server';
import { createInvoice, isTxHashUsed } from '@/lib/store';
import { CONTRACTS, PLATFORM_WALLET } from '@/lib/arc';
import { ethers } from 'ethers';
import { receiptClaims } from '@/lib/receipt-claims-db';
import { isLegacyArcRouteEnabled, buildLegacyRouteDecommissionedResponse } from '@/lib/legacy-route-gate';
import { safeLogger } from '@/lib/log-redact';
import { AgentInvoiceCreateWithPaymentZ, safeParse } from '@/lib/schemas';
import {
  AGENT_NANOPAYMENT_RAW_USDC_6,
  AGENT_NANOPAYMENT_DISPLAY_USDC,
  ARC_CHAIN_ID_HEX,
  ARC_CHAIN_ID_NUMBER,
} from '@/lib/billing';

const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://testnet.arc.eco/rpc';

function buildPaymentRequiredResponse(message = 'Invoice creation requires a 0.05 USDC nanopayment.'): NextResponse {
  const responseHeaders = new Headers();
  responseHeaders.set('X-Payment-Target', PLATFORM_WALLET);
  responseHeaders.set('X-Payment-Amount', AGENT_NANOPAYMENT_DISPLAY_USDC);
  responseHeaders.set('X-Payment-Asset', CONTRACTS.USDC);
  responseHeaders.set('X-Payment-Chain-Id', String(ARC_CHAIN_ID_NUMBER));

  return NextResponse.json(
    {
      error: 'Payment Required',
      message,
      paymentTarget: PLATFORM_WALLET,
      paymentAmount: AGENT_NANOPAYMENT_DISPLAY_USDC,
      paymentAsset: CONTRACTS.USDC,
      paymentChainId: ARC_CHAIN_ID_NUMBER,
      paymentChainIdHex: ARC_CHAIN_ID_HEX,
    },
    {
      status: 402,
      headers: responseHeaders,
    }
  );
}

async function verifyArcUSDCPayment(
  txHash: string,
  recipient: string,
  amount: bigint
): Promise<{ verified: boolean; payer?: string }> {
  const timeoutMs = 15_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const rpcWork = (async () => {
    try {
      const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
      const receipt = await provider.getTransactionReceipt(txHash);

      if (!receipt || receipt.status !== 1) {
        return { verified: false };
      }

      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const usdcAddress = CONTRACTS.USDC.toLowerCase();

      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== usdcAddress) continue;
        if (log.topics[0] !== transferTopic) continue;

        const fromHex = log.topics[1];
        const toHex = log.topics[2];
        if (!fromHex || !toHex) continue;

        const payerAddress = '0x' + fromHex.slice(26).toLowerCase();
        const recipientAddress = '0x' + toHex.slice(26).toLowerCase();
        if (recipientAddress !== recipient.toLowerCase()) continue;

        const value = BigInt(log.data);
        if (value >= amount) {
          return { verified: true, payer: payerAddress };
        }
      }
      return { verified: false };
    } catch (err) {
      safeLogger.error('Error verifying payment transaction:', err);
      return { verified: false };
    }
  })();
  const timeoutPromise = new Promise<{ verified: boolean; payer?: string }>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error(`Arc RPC timed out after ${timeoutMs}ms`)));
  });
  try {
    return await Promise.race([rpcWork, timeoutPromise]);
  } catch (err) {
    safeLogger.warn('Arc agent verify timed out — returning unverified:', err instanceof Error ? err.message : String(err));
    return { verified: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: NextRequest) {
  if (!isLegacyArcRouteEnabled()) {
    return buildLegacyRouteDecommissionedResponse('/api/agent/invoice-create');
  }
  try {
    const body = await request.json();

    const parsed = safeParse(AgentInvoiceCreateWithPaymentZ, body);
    if (!parsed.success) {
      safeLogger.warn('[InvoiceCreate] Schema validation failed:', parsed.issues);
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.issues },
        { status: 400 }
      );
    }
    const { amount, currency, description, recipientAddress, recipientName, txHash } = parsed.data;
    const feeAmountRaw = AGENT_NANOPAYMENT_RAW_USDC_6;

    // Initial HTTP 402 challenge when txHash is not yet provided
    if (!txHash) {
      return buildPaymentRequiredResponse();
    }

    // Idempotency guard (SEC3): prevent the same on-chain TX from creating multiple invoices
    const txHashAlreadyUsed = await isTxHashUsed(txHash);
    if (txHashAlreadyUsed) {
      return NextResponse.json(
        { error: 'Duplicate Payment', message: 'This transaction hash has already been used to create an invoice.' },
        { status: 409 }
      );
    }

    // Reject if payment not yet verified → issue HTTP 402 with payment target headers
    const paymentCheck = await verifyArcUSDCPayment(txHash, PLATFORM_WALLET, feeAmountRaw);
    if (!paymentCheck.verified) {
      return buildPaymentRequiredResponse('Submitted nanopayment transaction could not be verified on Arc.');
    }

    // Consume the nanopayment receipt atomically so it can fund exactly one invoice.
    const claimed = await receiptClaims.claim(txHash, 'agent-invoice-create');
    if (!claimed) {
      return NextResponse.json(
        { error: 'Duplicate Payment', message: 'This transaction hash has already been used to create an invoice.' },
        { status: 409 }
      );
    }

    let invoice;
    try {
      invoice = await createInvoice({
        ownerAddress: paymentCheck.payer || recipientAddress.toLowerCase(),
        amount,
        currency,
        description: (description ?? '').trim() || '(no description)',
        recipientAddress,
        recipientName,
        network: 'arc',
      });
    } catch (createErr) {
      await receiptClaims.release(txHash);
      throw createErr;
    }

    return NextResponse.json(
      {
        status: 'created',
        invoice,
        payer: paymentCheck.payer,
        message: 'Invoice created successfully via HTTP 402 nanopayment verification.'
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    safeLogger.error('[InvoiceCreate] Unhandled failure:', err);
    return NextResponse.json({ error: errMsg || 'Invoice creation failed' }, { status: 500 });
  }
}
