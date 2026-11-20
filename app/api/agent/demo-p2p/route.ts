import { NextRequest, NextResponse } from 'next/server';
import {
  splitSolanaAmount,
  unitsToDecimalString,
  SOLANA_MINTS,
  SOLANA_PLATFORM_WALLET,
  deriveInvoiceReferencePubkey,
  buildPactopusMemo,
} from '@/lib/solana';

export const runtime = 'nodejs';

interface DemoStep {
  timestamp: string;
  agentName: string;
  stepName: string;
  status: string;
  details: Record<string, unknown>;
}

interface DemoInvoice {
  id: string;
  amount: string;
  currency: 'USDC' | 'EURC';
  description: string;
  recipientAddress: string;
  recipientName: string;
  status: 'pending' | 'paid';
  seekerVerified: boolean;
  referencePubkey: string;
  memo: string;
  createdAt: string;
}

const FREELANCER = {
  name: 'Kyrvyn Studio (London, UK)',
  address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
};

const CLIENT = {
  name: 'Solana Ecosystem Partner',
  address: '5YNmS1R9nNSCDzb5a7mMJ1dwK9uHeAAF4CmPEwKgVWr8',
  autoApproveBudget: 5000.0,
};

function timestamp(): string {
  return new Date().toISOString();
}

function generateInvoiceId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `sol-sim-${seg(4)}-${seg(4)}`;
}

async function tryWriteAgentLog(action: string, details: string, txHash?: string, status = 'success'): Promise<void> {
  try {
    const { prisma } = await import('@/lib/db');
    if (prisma && prisma.agentLog) {
      await prisma.agentLog.create({
        data: { action, details, txHash: txHash ?? null, status },
      });
    }
  } catch {
    // Prisma not available — skip silently in simulation mode
  }
}

export async function POST(request: NextRequest) {
  try {
    const steps: DemoStep[] = [];
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // Empty or invalid body — use defaults
    }

    const amount = typeof body.amount === 'string' ? body.amount : '1000.00';
    const currency = (body.currency === 'USDC' || body.currency === 'EURC') ? body.currency : 'USDC';
    const description = typeof body.description === 'string' ? body.description : 'Solana Seeker dApp engineering & UK GBP tax snapshot';
    const recipientName = typeof body.recipientName === 'string' ? body.recipientName : FREELANCER.name;
    const isSeekerVerified = Boolean(body.seekerVerified ?? true);

    const invoiceId = generateInvoiceId();
    const referencePubkey = deriveInvoiceReferencePubkey(invoiceId);
    const memo = buildPactopusMemo(invoiceId, isSeekerVerified ? 'seeker' : 'solana');

    const invoice: DemoInvoice = {
      id: invoiceId,
      amount,
      currency,
      description,
      recipientAddress: FREELANCER.address,
      recipientName: FREELANCER.name,
      status: 'pending',
      seekerVerified: isSeekerVerified,
      referencePubkey,
      memo,
      createdAt: timestamp(),
    };

    steps.push({
      timestamp: timestamp(),
      agentName: FREELANCER.name,
      stepName: 'create-invoice',
      status: 'success',
      details: {
        mode: 'solana-atomic-spl-simulation',
        invoiceId,
        amount,
        currency,
        description,
        recipientName,
        recipientAddress: FREELANCER.address,
        referencePubkey,
        memo,
        seekerVerified: isSeekerVerified,
      },
    });

    const amountNum = parseFloat(amount);
    const budget = CLIENT.autoApproveBudget;
    let approved = false;
    let approvalRationale = '';

    if ((currency === 'USDC' || currency === 'EURC') && amountNum <= budget) {
      approved = true;
      approvalRationale = `POLICY EVALUATION: Client "${CLIENT.name}" approved Solana SPL invoice ${invoiceId}. Reason: Invoice amount (${amount} ${currency}) ≤ budget (${budget.toFixed(2)} ${currency}).`;
    } else {
      approved = false;
      approvalRationale = `POLICY EVALUATION: Client "${CLIENT.name}" DENIED invoice ${invoiceId}. Reason: Invoice amount (${amount} ${currency}) exceeds auto-approve budget (${budget.toFixed(2)} ${currency}).`;
    }

    steps.push({
      timestamp: timestamp(),
      agentName: CLIENT.name,
      stepName: 'auto-approve-decision',
      status: approved ? 'approved' : 'denied',
      details: {
        invoiceId,
        amountNum,
        budget,
        currency,
        approved,
        approvalRationale,
      },
    });

    if (!approved) {
      return NextResponse.json({
        status: 'denied',
        simulation: true,
        steps,
        invoice,
        approvalRationale,
        message: 'Client denied the invoice per budget policy.',
      }, { status: 200 });
    }

    const split = splitSolanaAmount(amount, {
      isSeekerVerified,
      currency,
    });
    const feeAmount = unitsToDecimalString(split.fee);
    const netAmount = unitsToDecimalString(split.net);
    const mintAddress = currency === 'EURC' ? SOLANA_MINTS.EURC : SOLANA_MINTS.USDC;
    const platformWallet = SOLANA_PLATFORM_WALLET;

    const atomicSignatureRef = `sim:solana-atomic:${invoiceId}`;

    steps.push({
      timestamp: timestamp(),
      agentName: CLIENT.name,
      stepName: 'fee-split-calc',
      status: 'success',
      details: {
        grossAmount: amount,
        platformFeeBps: split.feeBps,
        maxCapGbp: split.maxCapGbp,
        capApplied: split.capApplied,
        feeAmount,
        netAmount,
        gbpRate: split.gbpRate,
        gbpAmount: split.gbpTotalFormatted,
        gbpFee: split.gbpFeeFormatted,
        gbpNetAmount: split.gbpNetFormatted,
      },
    });

    steps.push({
      timestamp: timestamp(),
      agentName: CLIENT.name,
      stepName: 'simulate-atomic-spl-settlement',
      status: 'simulated',
      details: {
        from: CLIENT.address,
        recipient: FREELANCER.address,
        platformTreasury: platformWallet,
        asset: currency,
        mint: mintAddress,
        netAmount,
        feeAmount,
        referencePubkey,
        memo,
        signature: atomicSignatureRef,
      },
    });

    await tryWriteAgentLog(
      'p2p_simulation_create_invoice',
      `[Simulation] Freelancer ${FREELANCER.name} created Solana SPL invoice ${invoiceId} for ${amount} ${currency} (£${split.gbpTotalFormatted} GBP): ${description}`,
      undefined,
      'simulated'
    );

    await tryWriteAgentLog(
      'p2p_simulation_pay_invoice',
      `[Simulation] Client ${CLIENT.name} settled Solana SPL invoice ${invoiceId}: net ${netAmount} ${currency} (£${split.gbpNetFormatted}), fee ${feeAmount} ${currency} (£${split.gbpFeeFormatted}, ${split.feeBps} bps, max £${split.maxCapGbp} cap).`,
      undefined,
      'simulated'
    );

    invoice.status = 'paid';

    return NextResponse.json({
      status: 'success',
      simulation: true,
      steps,
      invoice,
      payment: {
        payoutTxHash: atomicSignatureRef,
        feeTxHash: atomicSignatureRef,
        netAmount,
        feeAmount,
        gbpRate: split.gbpRate,
        gbpAmount: split.gbpTotalFormatted,
        gbpFee: split.gbpFeeFormatted,
        gbpNetAmount: split.gbpNetFormatted,
      },
      onChainLinks: {
        payoutTxLink: null,
        feeTxLink: null,
      },
      approvalRationale,
      agents: {
        freelancer: FREELANCER,
        client: CLIENT,
      },
      platformFeeBps: split.feeBps,
      maxCapGbp: split.maxCapGbp,
    }, { status: 200 });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: 'error', error: errMsg || 'Solana SPL policy simulation failed' },
      { status: 500 }
    );
  }
}
