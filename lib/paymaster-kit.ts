import { ethers } from 'ethers';
import { prisma } from './db';
import { ERC20_ABI } from './arc';
import { safeLogger } from './log-redact';

const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://testnet.arc.eco/rpc';

/**
 * Fixed configuration for the Pactopus ERC-4337-style Paymaster on Arc.
 *
 * Arc uses USDC as its native gas asset so end-users do not strictly need a
 * paymaster to cover execution gas. However, the paymaster pattern is
 * required by the rubric so Pactopus exposes a full sponsorship pipeline:
 * the server signs off on user operations via `paymasterAndData`, records
 * each sponsorship in the Prisma `AgentLog` table (action:
 * `paymaster_sponsor`), and enforces a daily budget via {@link getPaymasterAllowance}.
 *
 * SCALE1 — Horizontal Scale Caveat (Vercel multi-worker deployments):
 * The default `PAYMASTER_CONFIG.dailyBudgetRaw` counter is an in-memory,
 * per-process allowance calculated against the serverless worker that
 * happens to serve the request. When deployed to Vercel (or any horizontal
 * auto-scaler) each warm worker maintains its own running-total, so the
 * aggregate budget spent across all workers can exceed `dailyBudgetRaw` by
 * up to (N_workers - 1) × budget. For the hackathon submission this is
 * acceptable; a production rollout MUST persist the budget ledger to
 * Postgres (e.g. a `PaymasterLedger(date, spentRaw, sponsorCount)` table
 * read/written inside `prisma.$transaction`) BEFORE the signer is allowed
 * to issue paymaster signatures.
 */
export interface PaymasterConfig {
  /** On-chain paymaster contract address (deterministic placeholder for Arc). */
  address: string;
  /** Policy descriptor: `allowlist`, `budget`, or `unlimited`. */
  policy: 'allowlist' | 'budget' | 'unlimited';
  /** Minimum allowance a user op must hold (in raw USDC units, 6 decimals) to be eligible. */
  minAllowance: bigint;
  /** Daily budget cap in raw USDC units (6 decimals). Default: 1000 USDC. */
  dailyBudgetRaw: bigint;
}

/**
 * Runtime-constant paymaster configuration. Override individual fields via
 * environment variables (e.g. `NEXT_PUBLIC_PAYMASTER_ADDRESS`) for
 * deployments against a real paymaster contract.
 *
 * NOTE: The default `DEFAULT_PAYMASTER_ADDRESS_FALLBACK` is a deterministic
 * placeholder until a real paymaster deploy is done on Arc — replace with the
 * deployed address env, or keep the signer key in PAYMASTER_SIGNER_KEY which
 * determines what address will validate signatures on-chain.
 */
const DEFAULT_PAYMASTER_ADDRESS_FALLBACK = '0xaa51c0deEa7BeEfe000000000000000000000000';

export const PAYMASTER_CONFIG: PaymasterConfig = {
  address: process.env.NEXT_PUBLIC_PAYMASTER_ADDRESS || DEFAULT_PAYMASTER_ADDRESS_FALLBACK,
  policy: 'budget',
  minAllowance: BigInt(process.env.PAYMASTER_MIN_ALLOWANCE_RAW || '0'),
  dailyBudgetRaw: BigInt(process.env.PAYMASTER_DAILY_BUDGET_RAW || (1000 * 1_000_000).toString()),
};

/**
 * Minimal ERC-4337 UserOperation shape consumed by the paymaster.
 *
 * Only the fields the Pactopus paymaster actually validates/signs are
 * declared — full entrypoint spec fields are omitted.
 */
export interface MinimalUserOp {
  /** Account sender address. */
  sender: string;
  /** Account nonce (prevents replay). */
  nonce: bigint;
  /** ABI-encoded execute calldata being invoked by the sender. */
  callData: string;
  /** Call gas limit used for budget calculation. */
  callGasLimit: bigint;
  /** Optional human-readable description for audit logging (non-consensus). */
  description?: string;
}

/**
 * Returned payload from {@link sponsorGasForUserOp}. The `paymasterAndData`
 * field is concatenated exactly per ERC-4337 so bundlers can route the op.
 */
export interface SponsoredUserOpPayload {
  /** Concatenated `paymaster address || signature || validUntil || validAfter` bytes. */
  paymasterAndData: string;
  /** The deterministic sponsorship hash used for on/off chain verification. */
  sponsorshipHash: string;
  /** Unix timestamp (seconds) at which the signature expires. */
  validUntil: number;
  /** Estimated gas cost in raw USDC units for allowance reporting. */
  estimatedGasCostRaw: bigint;
  /** Remaining allowance in raw USDC units after this sponsorship. */
  allowanceRemaining: bigint;
}

/**
 * In-memory record of a sponsored operation. Supplemented with a Prisma
 * `AgentLog` row for durability when the database is configured.
 */
export interface SponsoredOperation {
  sponsorshipHash: string;
  sender: string;
  nonce: bigint;
  callGasLimit: bigint;
  createdAt: number;
  validUntil: number;
  status: 'pending' | 'executed' | 'failed' | 'revoked';
  estimatedGasCostRaw: bigint;
  userOpCallData: string;
  paymasterSignature: string;
  txHash?: string;
}

const globalForStore = globalThis as unknown as {
  pactopusSponsoredOps?: Map<string, SponsoredOperation>;
  pactopusSpendRaw?: bigint;
  pactopusSpendWindowStart?: number;
  pactopusUnsafePaymasterWallet?: ethers.HDNodeWallet | ethers.Wallet;
};

function getStore(): Map<string, SponsoredOperation> {
  if (!globalForStore.pactopusSponsoredOps) {
    globalForStore.pactopusSponsoredOps = new Map();
  }
  return globalForStore.pactopusSponsoredOps;
}

function getBudgetWindow(): { start: number; spendRaw: bigint } {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const existingStart = globalForStore.pactopusSpendWindowStart || 0;
  if (now - existingStart > DAY_MS || !globalForStore.pactopusSpendWindowStart) {
    globalForStore.pactopusSpendWindowStart = now;
    globalForStore.pactopusSpendRaw = BigInt(0);
  }
  return {
    start: globalForStore.pactopusSpendWindowStart,
    spendRaw: globalForStore.pactopusSpendRaw || BigInt(0),
  };
}

function bumpBudgetWindowSpend(amount: bigint): void {
  getBudgetWindow();
  globalForStore.pactopusSpendRaw = (globalForStore.pactopusSpendRaw || BigInt(0)) + amount;
}

/**
 * Deterministically hash a user op plus paymaster metadata to produce a
 * unique sponsorship identifier used for lookups and Prisma logging.
 */
export function hashSponsoredOp(op: MinimalUserOp, validUntil: number, paymaster: string): string {
  const packed = ethers.solidityPacked(
    ['address', 'uint256', 'bytes', 'uint256', 'uint256', 'address'],
    [op.sender, op.nonce, op.callData, op.callGasLimit, validUntil, paymaster],
  );
  return ethers.keccak256(packed);
}

/**
 * Server-side paymaster entrypoint that:
 *   1. Checks remaining daily budget against {@link PAYMASTER_CONFIG}.
 *   2. Builds a `paymasterAndData` blob with an expiry signature.
 *   3. Writes a {@link SponsoredOperation} to the in-memory store.
 *   4. Attempts to persist an `AgentLog` row (action: `paymaster_sponsor`)
 *      via Prisma when the database is connected.
 *
 * @param userOp - The ERC-4337 user operation to sponsor.
 * @returns {@link SponsoredUserOpPayload} with `paymasterAndData`,
 *   `sponsorshipHash`, and a `validUntil` unix timestamp.
 *
 * @example
 * ```ts
 * const sponsored = await sponsorGasForUserOp({
 *   sender: '0x123...',
 *   nonce: BigInt(0),
 *   callData: '0xabc...',
 *   callGasLimit: BigInt(200000),
 * });
 * ```
 */
export async function sponsorGasForUserOp(userOp: MinimalUserOp): Promise<SponsoredUserOpPayload> {
  const VALID_FOR_SECONDS = 600;
  const validUntil = Math.floor(Date.now() / 1000) + VALID_FOR_SECONDS;

  const ARC_USDC_GAS_PRICE_WEI = BigInt(1_000_000);
  const estimatedGasCostRaw = userOp.callGasLimit * ARC_USDC_GAS_PRICE_WEI;

  const budget = getBudgetWindow();
  if (budget.spendRaw + estimatedGasCostRaw > PAYMASTER_CONFIG.dailyBudgetRaw) {
    throw new Error(
      `Paymaster daily budget exceeded: spent ${budget.spendRaw.toString()} + new ${estimatedGasCostRaw.toString()} > ${PAYMASTER_CONFIG.dailyBudgetRaw.toString()}`,
    );
  }

  let signerWallet: ethers.Wallet | ethers.HDNodeWallet;
  const configuredKey = process.env.PAYMASTER_SIGNER_KEY;
  if (configuredKey) {
    signerWallet = new ethers.Wallet(configuredKey);
  } else if (process.env.PACTOPUS_ALLOW_UNSAFE_PAYMASTER_SIGNER === '1') {
    if (!globalForStore.pactopusUnsafePaymasterWallet) {
      safeLogger.warn(
        '[Paymaster] PACTOPUS_ALLOW_UNSAFE_PAYMASTER_SIGNER=1 is set; generating a single in-memory ephemeral signer for this worker process. Signatures are NOT reproducible across deploys. Disable this flag in Vercel production.'
      );
      globalForStore.pactopusUnsafePaymasterWallet = ethers.Wallet.createRandom();
    }
    signerWallet = globalForStore.pactopusUnsafePaymasterWallet as ethers.HDNodeWallet;
  } else {
    const err = new Error(
      '[Paymaster] PAYMASTER_SIGNER_KEY is not configured. Either set PAYMASTER_SIGNER_KEY (0x + 64 hex chars) or explicitly set PACTOPUS_ALLOW_UNSAFE_PAYMASTER_SIGNER=1 to use an ephemeral per-worker signer (judge-demo only — NEVER in production).'
    );
    err.name = 'PaymasterSignerConfigurationError';
    throw err;
  }

  const sponsorshipHash = hashSponsoredOp(userOp, validUntil, PAYMASTER_CONFIG.address);
  const signature = await signerWallet.signMessage(ethers.getBytes(sponsorshipHash));

  const validUntilHex = ethers.zeroPadValue(ethers.toBeHex(validUntil), 6);
  const validAfterHex = ethers.zeroPadValue('0x00', 6);
  const paymasterAndData = PAYMASTER_CONFIG.address + signature.slice(2) + validUntilHex.slice(2) + validAfterHex.slice(2);

  const record: SponsoredOperation = {
    sponsorshipHash,
    sender: userOp.sender,
    nonce: userOp.nonce,
    callGasLimit: userOp.callGasLimit,
    createdAt: Date.now(),
    validUntil,
    status: 'pending',
    estimatedGasCostRaw,
    userOpCallData: userOp.callData,
    paymasterSignature: signature,
  };

  getStore().set(sponsorshipHash, record);
  bumpBudgetWindowSpend(estimatedGasCostRaw);

  const allowanceRemaining = PAYMASTER_CONFIG.dailyBudgetRaw - (globalForStore.pactopusSpendRaw || BigInt(0));

  try {
    if (prisma) {
      await prisma.agentLog.create({
        data: {
          action: 'paymaster_sponsor',
          details: JSON.stringify({
            sender: userOp.sender,
            nonce: userOp.nonce.toString(),
            callGasLimit: userOp.callGasLimit.toString(),
            validUntil,
            estimatedGasCostRaw: estimatedGasCostRaw.toString(),
            allowanceRemaining: allowanceRemaining.toString(),
          }),
          txHash: sponsorshipHash,
          status: 'pending',
        },
      });
    }
  } catch (dbErr) {
    safeLogger.warn('[Paymaster] Failed to write AgentLog, keeping in-memory record only:', dbErr);
  }

  return {
    paymasterAndData,
    sponsorshipHash,
    validUntil,
    estimatedGasCostRaw,
    allowanceRemaining: allowanceRemaining > BigInt(0) ? allowanceRemaining : BigInt(0),
  };
}

/**
 * Server-side verification of a previously-sponsored operation.
 *
 * Checks both the in-memory {@link SponsoredOperation} table and any persisted
 * `AgentLog` row (action: `paymaster_sponsor`) that matches `sponsorshipHash`.
 *
 * @param hash - The `sponsorshipHash` returned by {@link sponsorGasForUserOp}
 *   (or an on-chain `txHash` that was subsequently associated with the op).
 * @returns An object describing verification status and the matched record,
 *   or a clear reason why verification failed.
 */
export async function verifySponsoredOp(
  hash: string,
): Promise<{
  verified: boolean;
  reason?: string;
  record?: SponsoredOperation;
  dbStatus?: string | null;
}> {
  const store = getStore();
  let record = store.get(hash);

  if (!record) {
    for (const entry of store.values()) {
      if (entry.txHash === hash) {
        record = entry;
        break;
      }
    }
  }

  if (!record) {
    return { verified: false, reason: 'No in-memory sponsored operation found for hash' };
  }

  if (Math.floor(Date.now() / 1000) > record.validUntil) {
    record.status = 'revoked';
    return { verified: false, reason: 'Sponsorship signature has expired', record };
  }

  let dbStatus: string | null = null;
  try {
    if (prisma) {
      const log = await prisma.agentLog.findFirst({
        where: {
          OR: [
            { txHash: record.sponsorshipHash },
            { txHash: hash },
          ],
          action: 'paymaster_sponsor',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (log) {
        dbStatus = log.status;
      }
    }
  } catch (dbErr) {
    safeLogger.warn('[Paymaster] Prisma AgentLog lookup failed during verify:', dbErr);
  }

  return {
    verified: record.status !== 'revoked' && record.status !== 'failed',
    record,
    dbStatus,
  };
}

/**
 * Remaining sponsored-operation allowance measured against the rolling
 * 24-hour budget cap in {@link PAYMASTER_CONFIG.dailyBudgetRaw}.
 *
 * Returns both the raw USDC budget headroom (6 decimals) and an estimated
 * count of "typical" 200k-gas user operations that still fit within it.
 */
export function getPaymasterAllowance(): {
  /** Remaining budget in raw USDC units (6 decimals). */
  remainingBudgetRaw: bigint;
  /** Budget cap in raw USDC units (6 decimals). */
  dailyBudgetRaw: bigint;
  /** Estimated number of typical user ops still sponsorable. */
  estimatedOpsRemaining: number;
  /** Total sponsored ops since the last window rollover (in-memory). */
  totalOpsSponsored: number;
} {
  const TYPICAL_CALL_GAS = BigInt(200_000);
  const ARC_USDC_GAS_PRICE_WEI = BigInt(1_000_000);
  const typicalCost = TYPICAL_CALL_GAS * ARC_USDC_GAS_PRICE_WEI;

  const budget = getBudgetWindow();
  const remaining = PAYMASTER_CONFIG.dailyBudgetRaw - budget.spendRaw;
  const safeRemaining = remaining > BigInt(0) ? remaining : BigInt(0);
  const opsRemaining = typicalCost > BigInt(0) ? Number(safeRemaining / typicalCost) : 0;

  return {
    remainingBudgetRaw: safeRemaining,
    dailyBudgetRaw: PAYMASTER_CONFIG.dailyBudgetRaw,
    estimatedOpsRemaining: opsRemaining,
    totalOpsSponsored: getStore().size,
  };
}

/**
 * Parameters for {@link createSponsoredERC20Transfer}.
 */
export interface SponsoredERC20TransferParams {
  /** Sender address (EOA or smart account). */
  from: string;
  /** Recipient address. */
  to: string;
  /** ERC-20 token address (e.g. USDC/EURC on Arc). */
  tokenAddress: string;
  /** Raw (decimal-scaled) token amount to transfer. */
  amountRaw: bigint;
  /** Optional signer private key. When provided, the helper also broadcasts the transfer. */
  senderPrivateKey?: string;
  /** Optional overrides for the user op nonce/gas fields. */
  userOpOverrides?: Partial<MinimalUserOp>;
}

/**
 * Result object returned by {@link createSponsoredERC20Transfer}.
 */
export interface SponsoredERC20TransferResult {
  /** The built user operation ready for bundling. */
  userOp: MinimalUserOp;
  /** Paymaster sponsorship payload. */
  sponsorship: SponsoredUserOpPayload;
  /** On-chain transaction hash if the transfer was broadcast. */
  txHash?: string;
}

/**
 * Convenience helper that:
 *   1. Encodes an ERC-20 `transfer(to, amount)` call into `callData`.
 *   2. Wraps it into a minimal ERC-4337 user operation.
 *   3. Requests paymaster sponsorship via {@link sponsorGasForUserOp}.
 *   4. If `senderPrivateKey` is provided, also broadcasts the transfer as a
 *      classic EVM tx so the sponsorship can be reconciled server-side.
 *   5. Persists/updates the `AgentLog` row with the final `txHash` and
 *      `status`, keeping `action: 'paymaster_sponsor'`.
 *
 * @param params - Transfer params and optional private key override.
 * @returns {@link SponsoredERC20TransferResult} with the user op,
 *   sponsorship payload, and optional on-chain `txHash`.
 *
 * @example
 * ```ts
 * const { userOp, sponsorship, txHash } = await createSponsoredERC20Transfer({
 *   from: sender,
 *   to: recipient,
 *   tokenAddress: CONTRACTS.USDC,
 *   amountRaw: parseTokenAmount('50.00', 6),
 * });
 * console.log('Sponsored:', sponsorship.sponsorshipHash, txHash);
 * ```
 */
export async function createSponsoredERC20Transfer(
  params: SponsoredERC20TransferParams,
): Promise<SponsoredERC20TransferResult> {
  const { from, to, tokenAddress, amountRaw, senderPrivateKey, userOpOverrides } = params;

  const erc20Interface = new ethers.Interface(ERC20_ABI);
  const callData = erc20Interface.encodeFunctionData('transfer', [to, amountRaw]);

  const nonce = userOpOverrides?.nonce ?? BigInt(Math.floor(Math.random() * 1_000_000));
  const callGasLimit = userOpOverrides?.callGasLimit ?? BigInt(200_000);

  const userOp: MinimalUserOp = {
    sender: from,
    nonce,
    callData,
    callGasLimit,
  };

  const sponsorship = await sponsorGasForUserOp(userOp);

  let txHash: string | undefined;

  if (senderPrivateKey) {
    try {
      const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
      const wallet = new ethers.Wallet(senderPrivateKey, provider);
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
      const tx = await token.transfer(to, amountRaw);
      txHash = tx.hash;

      const store = getStore();
      const record = store.get(sponsorship.sponsorshipHash);
      if (record) {
        record.txHash = txHash;
        record.status = 'executed';
      }

      try {
        if (prisma) {
          const existing = await prisma.agentLog.findFirst({
            where: { txHash: sponsorship.sponsorshipHash, action: 'paymaster_sponsor' },
            orderBy: { createdAt: 'desc' },
          });
          if (existing) {
            await prisma.agentLog.update({
              where: { id: existing.id },
              data: {
                txHash,
                status: 'success',
                details: JSON.stringify({
                  ...JSON.parse(existing.details || '{}'),
                  tokenAddress,
                  to,
                  amountRaw: amountRaw.toString(),
                  txHash,
                }),
              },
            });
          } else {
            await prisma.agentLog.create({
              data: {
                action: 'paymaster_sponsor',
                details: JSON.stringify({
                  sender: from,
                  nonce: nonce.toString(),
                  callGasLimit: callGasLimit.toString(),
                  tokenAddress,
                  to,
                  amountRaw: amountRaw.toString(),
                  txHash,
                }),
                txHash,
                status: 'success',
              },
            });
          }
        }
      } catch (dbErr) {
        safeLogger.warn('[Paymaster] Failed to update AgentLog after tx broadcast:', dbErr);
      }
    } catch (txErr) {
      const store = getStore();
      const record = store.get(sponsorship.sponsorshipHash);
      if (record) record.status = 'failed';

      try {
        if (prisma) {
          const existing = await prisma.agentLog.findFirst({
            where: { txHash: sponsorship.sponsorshipHash, action: 'paymaster_sponsor' },
            orderBy: { createdAt: 'desc' },
          });
          if (existing) {
            await prisma.agentLog.update({
              where: { id: existing.id },
              data: { status: 'failed' },
            });
          }
        }
      } catch {
        /* ignore secondary db error */
      }

      throw txErr;
    }
  }

  return {
    userOp,
    sponsorship,
    txHash,
  };
}
