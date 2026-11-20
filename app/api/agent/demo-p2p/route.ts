import { NextRequest, NextResponse } from 'next/server';
import { PLATFORM_FEE_BPS, parseTokenAmount, formatTokenAmount, CONTRACTS } from '@/lib/arc';

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
  createdAt: string;
}

const FREELANCER = {
  name: 'Ada Lovelace Freelance LLC',
  address: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
};

const CLIENT = {
  name: 'Babbage Consulting Inc',
  address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  autoApproveBudget: 500.0,
};

function timestamp(): string {
  return new Date().toISOString();
}

function generateInvoiceId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `sim-${seg(4)}-${seg(4)}`;
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

    const amount = typeof body.amount === 'string' ? body.amount : '250.00';
    const currency = (body.currency === 'USDC' || body.currency === 'EURC') ? body.currency : 'USDC';
    const description = typeof body.description === 'string' ? body.description : 'Q3 consulting retainer';
    const recipientName = typeof body.recipientName === 'string' ? body.recipientName : 'Freelancer Agent Ada';

    const invoiceId = generateInvoiceId();
    const invoice: DemoInvoice = {
      id: invoiceId,
      amount,
      currency,
      description,
      recipientAddress: FREELANCER.address,
      recipientName: FREELANCER.name,
      status: 'pending',
      createdAt: timestamp(),
    };

    steps.push({
      timestamp: timestamp(),
      agentName: FREELANCER.name,
      stepName: 'create-invoice',
      status: 'success',
      details: {
        mode: 'policy-simulation',
        invoiceId,
        amount,
        currency,
        description,
        recipientName,
        recipientAddress: FREELANCER.address,
      },
    });

    const amountNum = parseFloat(amount);
    const budget = CLIENT.autoApproveBudget;
    let approved = false;
    let approvalRationale = '';

    if (currency === 'USDC' && amountNum <= budget) {
      approved = true;
      approvalRationale = `POLICY EVALUATION: Client agent "${CLIENT.name}" auto-approved invoice ${invoiceId}. Reason: Invoice amount (${amount} ${currency}) ≤ auto-approve budget (${budget.toFixed(2)} USDC) && currency === USDC. Both policy checks passed.`;
    } else if (currency !== 'USDC') {
      approved = false;
      approvalRationale = `POLICY EVALUATION: Client agent "${CLIENT.name}" DENIED invoice ${invoiceId}. Reason: Currency is ${currency} but auto-approve policy requires USDC. Escalation to human operator required.`;
    } else {
      approved = false;
      approvalRationale = `POLICY EVALUATION: Client agent "${CLIENT.name}" DENIED invoice ${invoiceId}. Reason: Invoice amount (${amount} ${currency}) exceeds auto-approve budget (${budget.toFixed(2)} USDC). Escalation to human operator required.`;
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
        message: 'Client agent denied the invoice per auto-approve policy.',
      }, { status: 200 });
    }

    const rawAmount = parseTokenAmount(amount, 6);
    const feeRaw = (rawAmount * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
    const netRaw = rawAmount - feeRaw;
    const feeAmount = formatTokenAmount(feeRaw, 6);
    const netAmount = formatTokenAmount(netRaw, 6);

    const payoutRef = `sim:payout:${invoiceId}`;
    const feeRef = `sim:fee:${invoiceId}`;

    steps.push({
      timestamp: timestamp(),
      agentName: CLIENT.name,
      stepName: 'fee-split-calc',
      status: 'success',
      details: {
        grossAmount: amount,
        platformFeeBps: PLATFORM_FEE_BPS,
        feeAmount,
        netAmount,
      },
    });

    steps.push({
      timestamp: timestamp(),
      agentName: CLIENT.name,
      stepName: 'simulate-payout-split',
      status: 'simulated',
      details: {
        from: CLIENT.address,
        to: FREELANCER.address,
        asset: currency,
        contract: CONTRACTS.USDC,
        amount: netAmount,
        reference: payoutRef,
      },
    });

    steps.push({
      timestamp: timestamp(),
      agentName: CLIENT.name,
      stepName: 'simulate-fee-split',
      status: 'simulated',
      details: {
        from: CLIENT.address,
        to: 'PLATFORM_WALLET',
        asset: currency,
        contract: CONTRACTS.USDC,
        amount: feeAmount,
        reference: feeRef,
      },
    });

    await tryWriteAgentLog(
      'p2p_simulation_create_invoice',
      `[Simulation] Freelancer ${FREELANCER.name} evaluated invoice ${invoiceId} for ${amount} ${currency}: ${description}`,
      undefined,
      'simulated'
    );

    await tryWriteAgentLog(
      'p2p_simulation_pay_invoice',
      `[Simulation] Client ${CLIENT.name} evaluated invoice ${invoiceId}: net ${netAmount} to ${FREELANCER.name}, fee ${feeAmount} (${PLATFORM_FEE_BPS} bps). ${approvalRationale}`,
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
        payoutTxHash: payoutRef,
        feeTxHash: feeRef,
        netAmount,
        feeAmount,
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
      platformFeeBps: PLATFORM_FEE_BPS,
    }, { status: 200 });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: 'error', error: errMsg || 'P2P agent policy simulation failed' },
      { status: 500 }
    );
  }
}
