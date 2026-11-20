import { ethers } from 'ethers';
import { CONTRACTS, PLATFORM_WALLET, PLATFORM_FEE_BPS, parseTokenAmount, formatTokenAmount } from '../lib/arc';

const IS_DEMO = process.env.PACTOPUS_DEMO_MODE === 'true' || !process.env.DATABASE_URL || process.env.NODE_ENV !== 'production';

// Generate ephemeral random keys at runtime (or read from environment) so no static private keys sit in source code.
const freelancerWallet = process.env.DEMO_FREELANCER_PRIVATE_KEY
  ? new ethers.Wallet(process.env.DEMO_FREELANCER_PRIVATE_KEY)
  : ethers.Wallet.createRandom();

const clientWallet = process.env.DEMO_CLIENT_PRIVATE_KEY
  ? new ethers.Wallet(process.env.DEMO_CLIENT_PRIVATE_KEY)
  : ethers.Wallet.createRandom();

const FREELANCER = {
  name: 'Freelancer Agent (Ada Lovelace)',
  address: freelancerWallet.address,
  privateKey: freelancerWallet.privateKey,
};

const CLIENT = {
  name: 'Client Agent (Charles Babbage)',
  address: clientWallet.address,
  privateKey: clientWallet.privateKey,
  balance: 1000.0,
  autoApproveBudget: 500.0,
};

interface DemoInvoice {
  id: string;
  amount: string;
  currency: 'USDC' | 'EURC';
  description: string;
  recipientAddress: string;
  recipientName: string;
  status: 'pending' | 'paid';
  createdAt: string;
  signature: string;
  nanoPaymentTxHash?: string;
  payoutTxHash?: string;
  feeTxHash?: string;
  paidAt?: string;
  paidBy?: string;
  fee?: string;
  network: 'arc';
}

const inMemoryInvoices = new Map<string, DemoInvoice>();

function timestamp(): string {
  return new Date().toISOString();
}

function log(agent: string, step: string, status: string, extra?: Record<string, unknown>): void {
  const parts: string[] = [`[${timestamp()}]`, `[${agent}]`, `[${step}]`, `[${status}]`];
  if (extra) {
    parts.push(JSON.stringify(extra));
  }
  console.log(parts.join(' '));
}

async function tryWriteAgentLog(action: string, details: string, txHash?: string, status = 'success'): Promise<void> {
  if (IS_DEMO) {
    log('AGENT-LOG', action, status, { details, txHash: txHash ?? null, persisted: false });
    return;
  }
  try {
    const { prisma } = await import('../lib/db');
    if (prisma) {
      await prisma.agentLog.create({
        data: { action, details, txHash: txHash ?? null, status },
      });
      log('AGENT-LOG', action, status, { persisted: true });
    } else {
      log('AGENT-LOG', action, status, { details, txHash: txHash ?? null, persisted: false });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('AGENT-LOG', action, 'db-failed', { reason: msg, details, txHash: txHash ?? null });
  }
}

function generateInvoiceId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg(4)}-${seg(4)}-${seg(4)}`;
}

function signInvoicePayload(payload: Record<string, unknown>, privateKey: string): string {
  const canonical = JSON.stringify(payload);
  const hash = ethers.keccak256(ethers.toUtf8Bytes(canonical));
  const signingKey = new ethers.SigningKey(privateKey);
  return signingKey.sign(hash).serialized;
}

function verifyInvoiceSignature(invoice: DemoInvoice): boolean {
  try {
    const { signature, ...payload } = invoice;
    const canonical = JSON.stringify(payload);
    const hash = ethers.keccak256(ethers.toUtf8Bytes(canonical));
    const recovered = ethers.recoverAddress(hash, signature).toLowerCase();
    return recovered === invoice.recipientAddress.toLowerCase();
  } catch {
    return false;
  }
}

function simulatedDigest(prefix: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`${prefix}-${timestamp()}-${Math.random()}`));
}

async function step1FreelancerCreateInvoice(): Promise<DemoInvoice> {
  const agent = FREELANCER.name;
  const amount = '250.00';
  const currency: 'USDC' | 'EURC' = 'USDC';
  const description = 'Q3 consulting retainer';

  log(agent, 'CREATE-INVOICE-INIT', 'start', { amount, currency, description, recipient: FREELANCER.address });

  const nanoPaymentAmount = '0.05';
  const nanoPaymentTarget = PLATFORM_WALLET;
  const nanoPaymentAsset = CONTRACTS.USDC;
  const nanoPaymentTxHash = simulatedDigest('nano');

  log(agent, 'HTTP-402-NANOPAYMENT', 'required', {
    httpStatus: 402,
    amount: nanoPaymentAmount,
    asset: nanoPaymentAsset,
    target: nanoPaymentTarget,
  });

  log(agent, 'HTTP-402-NANOPAYMENT', 'simulated-digest', {
    from: FREELANCER.address,
    to: nanoPaymentTarget,
    valueRaw: parseTokenAmount(nanoPaymentAmount, 6).toString(),
    txHash: nanoPaymentTxHash,
  });

  await tryWriteAgentLog(
    'freelancer.nanopayment.pay',
    `HTTP 402 nanopayment of ${nanoPaymentAmount} USDC simulated to platform wallet ${nanoPaymentTarget} for invoice creation`,
    nanoPaymentTxHash,
    'success'
  );

  const invoiceId = generateInvoiceId();
  const basePayload: Omit<DemoInvoice, 'signature'> = {
    id: invoiceId,
    amount,
    currency,
    description,
    recipientAddress: FREELANCER.address,
    recipientName: FREELANCER.name,
    status: 'pending',
    createdAt: timestamp(),
    nanoPaymentTxHash,
    network: 'arc',
  };
  const signature = signInvoicePayload(basePayload, FREELANCER.privateKey);
  const invoice: DemoInvoice = { ...basePayload, signature };
  inMemoryInvoices.set(invoiceId, invoice);

  log(agent, 'CREATE-INVOICE-FINAL', 'success', {
    invoiceId,
    recipient: invoice.recipientAddress,
    signature: signature.slice(0, 10) + '…',
    nanoPaymentTxHash,
  });

  await tryWriteAgentLog(
    'freelancer.invoice.create',
    `Invoice ${invoiceId} created for ${amount} ${currency}: ${description}`,
    nanoPaymentTxHash,
    'success'
  );

  return invoice;
}

interface PaymentDecision {
  approved: boolean;
  rationale: string;
  amountNum: number;
  budget: number;
}

function decideAutoApprove(invoice: DemoInvoice): PaymentDecision {
  const amountNum = parseFloat(invoice.amount);
  const budget = CLIENT.autoApproveBudget;
  if (amountNum > CLIENT.balance) {
    return {
      approved: false,
      rationale: `Invoice amount ${amountNum} exceeds client wallet balance ${CLIENT.balance} USDC`,
      amountNum,
      budget,
    };
  }
  if (amountNum > budget) {
    return {
      approved: false,
      rationale: `Invoice amount ${amountNum} exceeds client auto-approve budget of ${budget} USDC; escalation required`,
      amountNum,
      budget,
    };
  }
  return {
    approved: true,
    rationale: `Invoice amount ${amountNum} USDC is within auto-approve budget (${budget} USDC) and client balance (${CLIENT.balance} USDC) — auto-approved`,
    amountNum,
    budget,
  };
}

async function step2ClientPayInvoice(invoiceId: string): Promise<DemoInvoice> {
  const agent = CLIENT.name;
  log(agent, 'FETCH-INVOICE', 'start', { invoiceId });

  const invoice = inMemoryInvoices.get(invoiceId);
  if (!invoice) {
    log(agent, 'FETCH-INVOICE', 'not-found', { invoiceId });
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  log(agent, 'FETCH-INVOICE', 'received', {
    invoiceId,
    amount: invoice.amount,
    currency: invoice.currency,
    recipient: invoice.recipientAddress,
    description: invoice.description,
  });

  log(agent, 'VERIFY-SIGNATURE', 'start', { invoiceId });
  const sigOk = verifyInvoiceSignature(invoice);
  log(agent, 'VERIFY-SIGNATURE', sigOk ? 'valid' : 'invalid', {
    invoiceId,
    recoveredMatches: sigOk,
  });
  if (!sigOk) {
    log(agent, 'VERIFY-SIGNATURE', 'abort', { invoiceId, reason: 'signature mismatch — refusing to pay' });
    await tryWriteAgentLog('client.invoice.verify', `Signature verification failed for invoice ${invoiceId}`, undefined, 'failed');
    throw new Error('Invoice signature invalid');
  }

  const rawAmount = parseTokenAmount(invoice.amount, 6);
  const expectedAsset = invoice.currency === 'USDC' ? CONTRACTS.USDC : CONTRACTS.EURC;
  log(agent, 'VERIFY-AMOUNT-ASSET', 'validated', {
    invoiceId,
    rawAmount: rawAmount.toString(),
    asset: expectedAsset,
    assetSymbol: invoice.currency,
  });

  log(agent, 'AUTO-APPROVE-DECISION', 'evaluate', { invoiceId });
  const decision = decideAutoApprove(invoice);
  log(agent, 'AUTO-APPROVE-DECISION', decision.approved ? 'approved' : 'denied', {
    invoiceId,
    amount: decision.amountNum,
    budget: decision.budget,
    rationale: decision.rationale,
  });
  if (!decision.approved) {
    await tryWriteAgentLog('client.invoice.decline', decision.rationale, undefined, 'failed');
    throw new Error(`Auto-approve denied: ${decision.rationale}`);
  }
  await tryWriteAgentLog('client.invoice.approve', decision.rationale, undefined, 'success');

  const feeRaw = (rawAmount * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
  const netRaw = rawAmount - feeRaw;
  const feeDisplay = formatTokenAmount(feeRaw, 6);
  const netDisplay = formatTokenAmount(netRaw, 6);

  log(agent, 'FEE-SPLIT-CALC', 'computed', {
    invoiceId,
    gross: invoice.amount,
    feeBps: PLATFORM_FEE_BPS,
    fee: feeDisplay,
    net: netDisplay,
    platformWallet: PLATFORM_WALLET,
  });

  const payoutTxHash = simulatedDigest('payout');
  log(agent, 'SIMULATE-PAYOUT-TX', 'computed', {
    invoiceId,
    from: CLIENT.address,
    to: invoice.recipientAddress,
    asset: expectedAsset,
    amount: netDisplay,
    txHash: payoutTxHash,
  });

  const feeTxHash = simulatedDigest('fee');
  log(agent, 'SIMULATE-FEE-TX', 'computed', {
    invoiceId,
    from: CLIENT.address,
    to: PLATFORM_WALLET,
    asset: expectedAsset,
    amount: feeDisplay,
    txHash: feeTxHash,
  });

  await tryWriteAgentLog(
    'client.invoice.payout',
    `Payout of ${netDisplay} ${invoice.currency} to freelancer ${invoice.recipientAddress} for invoice ${invoiceId}`,
    payoutTxHash,
    'success'
  );
  await tryWriteAgentLog(
    'client.invoice.fee',
    `Platform fee of ${feeDisplay} ${invoice.currency} (${PLATFORM_FEE_BPS} bps) to ${PLATFORM_WALLET} for invoice ${invoiceId}`,
    feeTxHash,
    'success'
  );

  const updated: DemoInvoice = {
    ...invoice,
    status: 'paid',
    payoutTxHash,
    feeTxHash,
    paidAt: timestamp(),
    paidBy: CLIENT.address,
    fee: feeDisplay,
  };
  inMemoryInvoices.set(invoiceId, updated);

  log(agent, 'CONFIRM-INVOICE-PAID', 'success', {
    invoiceId,
    payoutTxHash,
    feeTxHash,
    paidBy: CLIENT.address,
    net: netDisplay,
    fee: feeDisplay,
  });

  await tryWriteAgentLog(
    'client.invoice.complete',
    `Invoice ${invoiceId} settled in simulation: ${netDisplay} net + ${feeDisplay} fee on Arc L1`,
    payoutTxHash,
    'success'
  );

  return updated;
}

async function main(): Promise<void> {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  Pactopus — Two-Agent P2P Policy & Fee-Split Simulation (Arc L1)  ║');
  console.log(`║  Mode: ${IS_DEMO ? 'DRY-RUN / NO DB (NODE_ENV=demo or no DATABASE_URL)'.padEnd(47) : 'WITH PRISMA AGENT LOG PERSISTENCE'.padEnd(47)} ║`);
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');

  const invoice = await step1FreelancerCreateInvoice();
  console.log('');
  const settled = await step2ClientPayInvoice(invoice.id);

  console.log('');
  console.log('─── SIMULATION SUMMARY ───');
  console.log(`Invoice ID    : ${settled.id}`);
  console.log(`Description   : ${settled.description}`);
  console.log(`Gross amount  : ${settled.amount} ${settled.currency}`);
  console.log(`Platform fee  : ${settled.fee} (${PLATFORM_FEE_BPS} bps)`);
  console.log(`Net to payee  : ${(parseFloat(settled.amount) - parseFloat(settled.fee || '0')).toFixed(2)}`);
  console.log(`Freelancer    : ${settled.recipientName} (${settled.recipientAddress})`);
  console.log(`Paid by       : ${CLIENT.name} (${settled.paidBy})`);
  console.log(`Nano digest   : ${settled.nanoPaymentTxHash}`);
  console.log(`Payout digest : ${settled.payoutTxHash}`);
  console.log(`Fee digest    : ${settled.feeTxHash}`);
  console.log(`Status        : ${settled.status.toUpperCase()}`);
  console.log('');
}

main().catch((err) => {
  log('DEMO-RUNTIME', 'fatal', 'error', { reason: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});
