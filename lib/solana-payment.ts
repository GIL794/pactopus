/**
 * Solana On-Chain Atomic Settlement Verifier & Memo/Reference Recovery Engine
 *
 * Implements the 6-state payment lifecycle:
 *   requested -> authorised -> submitted -> confirmed -> allocated -> accounted
 */

import {
  ACTIVE_SOLANA_CLUSTER,
  SOLANA_PLATFORM_WALLET,
  SPL_MEMO_PROGRAM_ID,
  buildPactopusMemo,
  deriveInvoiceReferencePubkey,
  isValidSolanaAddress,
  isValidSolanaSignature,
  splitSolanaAmount,
  verifySolanaAtomicSettlement,
  type ParsedSolanaTokenBalance,
  type ParsedSolanaTransactionLike,
  type PaymentLifecycleState,
  type SolanaFeeSplitResult,
} from './solana';
import { safeLogger } from './log-redact';

interface RpcTokenBalanceEntry {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount?: {
    amount?: string;
    decimals?: number;
  };
}

interface RpcParsedInstruction {
  program?: string;
  programId?: string;
  parsed?: unknown;
  data?: string;
}

interface RpcTransactionResult {
  meta?: {
    err: unknown | null;
    preTokenBalances?: RpcTokenBalanceEntry[];
    postTokenBalances?: RpcTokenBalanceEntry[];
    logMessages?: string[];
  } | null;
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey: string; signer?: boolean }>;
      instructions?: RpcParsedInstruction[];
    };
  };
}

export function normalizeRpcTransaction(
  signature: string,
  rpcTx: RpcTransactionResult | null | undefined
): ParsedSolanaTransactionLike | null {
  if (!rpcTx || !rpcTx.meta || !rpcTx.transaction?.message) return null;

  const rawKeys = rpcTx.transaction.message.accountKeys ?? [];
  const accountKeys: string[] = [];
  const signers: string[] = [];

  rawKeys.forEach((k, idx) => {
    if (typeof k === 'string') {
      accountKeys.push(k);
      if (idx === 0) signers.push(k);
    } else if (k && typeof k.pubkey === 'string') {
      accountKeys.push(k.pubkey);
      if (k.signer) signers.push(k.pubkey);
    }
  });

  const mapBalances = (entries?: RpcTokenBalanceEntry[]): ParsedSolanaTokenBalance[] =>
    (entries ?? [])
      .filter((e) => e && typeof e.owner === 'string' && typeof e.mint === 'string')
      .map((e) => ({
        owner: String(e.owner),
        mint: String(e.mint),
        amountRaw: BigInt(e.uiTokenAmount?.amount || '0'),
      }));

  let memo: string | null = null;
  for (const ix of rpcTx.transaction.message.instructions ?? []) {
    if (ix.program === 'spl-memo' || ix.programId === SPL_MEMO_PROGRAM_ID) {
      if (typeof ix.parsed === 'string') {
        memo = ix.parsed;
        break;
      }
    }
  }
  if (!memo && Array.isArray(rpcTx.meta.logMessages)) {
    const memoLog = rpcTx.meta.logMessages.find((l) => l.includes('pactopus:v2:'));
    if (memoLog) memo = memoLog;
  }

  return {
    signature,
    err: rpcTx.meta.err ?? null,
    signers,
    accountKeys,
    preTokenBalances: mapBalances(rpcTx.meta.preTokenBalances),
    postTokenBalances: mapBalances(rpcTx.meta.postTokenBalances),
    memo,
  };
}

export interface VerifySolanaPaymentOptions {
  signature?: string;
  invoiceId: string;
  payer: string;
  recipient: string;
  currency: 'USDC' | 'EURC';
  amount: string;
  isSeekerVerified?: boolean;
  gbpRate?: number;
  referencePubkey?: string;
  expectedReferencePubkey?: string;
  expectedMemo?: string;
  rpcUrl?: string;
}

export interface VerifySolanaPaymentResult {
  verified: boolean;
  lifecycleState: PaymentLifecycleState;
  state: PaymentLifecycleState;
  split: SolanaFeeSplitResult;
  effectiveFeeUnits: bigint;
  effectiveFeeBps: number;
  maxCapGbp: number;
  gbpRate: number;
  gbpNetFormatted: string;
  gbpFeeFormatted: string;
  reason?: string;
  discrepancyReason?: string;
}

/**
 * Verify a Solana payment transaction on-chain via JSON-RPC `getTransaction`.
 * Accepts either `(signature, expectedObj)` or `({ signature, ...expectedObj })`.
 */
export async function verifySolanaPaymentOnChain(
  sigOrOptions: string | VerifySolanaPaymentOptions,
  maybeExpected?: Omit<VerifySolanaPaymentOptions, 'signature'>
): Promise<VerifySolanaPaymentResult> {
  const expected: VerifySolanaPaymentOptions =
    typeof sigOrOptions === 'string'
      ? { ...(maybeExpected as Omit<VerifySolanaPaymentOptions, 'signature'>), signature: sigOrOptions }
      : sigOrOptions;
  const signature = expected.signature || '';

  const primarySplit = splitSolanaAmount(expected.amount, {
    isSeekerVerified: expected.isSeekerVerified,
    currency: expected.currency,
    gbpRate: expected.gbpRate,
  });

  const buildOut = (
    verified: boolean,
    lifecycleState: PaymentLifecycleState,
    split: SolanaFeeSplitResult,
    reason?: string
  ): VerifySolanaPaymentResult => ({
    verified,
    lifecycleState,
    state: lifecycleState,
    split,
    effectiveFeeUnits: split.fee,
    effectiveFeeBps: split.feeBps,
    maxCapGbp: split.maxCapGbp,
    gbpRate: split.gbpRate,
    gbpNetFormatted: split.gbpNetFormatted,
    gbpFeeFormatted: split.gbpFeeFormatted,
    reason,
    discrepancyReason: reason,
  });

  if (!isValidSolanaSignature(signature)) {
    return buildOut(false, 'discrepancy', primarySplit, 'Invalid Solana Base58 signature.');
  }

  const rpcUrl = expected.rpcUrl || ACTIVE_SOLANA_CLUSTER.rpcUrl;
  const expectedMint = ACTIVE_SOLANA_CLUSTER.tokens[expected.currency].mint;
  const refPubkey = expected.expectedReferencePubkey || expected.referencePubkey;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
          signature,
          {
            encoding: 'jsonParsed',
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          },
        ],
      }),
    });

    if (!res.ok) {
      return buildOut(false, 'submitted', primarySplit, `Solana RPC returned HTTP ${res.status}`);
    }

    const payload = (await res.json()) as { result?: RpcTransactionResult | null };
    const parsedTx = normalizeRpcTransaction(signature, payload.result);

    const checkWithSplit = (split: SolanaFeeSplitResult) =>
      verifySolanaAtomicSettlement({
        tx: parsedTx,
        expectedMint,
        payer: expected.payer,
        recipient: expected.recipient,
        platform: SOLANA_PLATFORM_WALLET,
        expectedNet: split.net,
        expectedFee: split.fee,
        expectedMemo: (
          expected.expectedMemo ||
          buildPactopusMemo(expected.invoiceId, expected.isSeekerVerified ? 'seeker' : 'solana')
        ).slice(0, 12),
        expectedReference: refPubkey,
      });

    const primaryCheck = checkWithSplit(primarySplit);
    if (primaryCheck.ok) {
      return buildOut(true, 'accounted', primarySplit);
    }

    const alternateSplit = splitSolanaAmount(expected.amount, {
      isSeekerVerified: !expected.isSeekerVerified,
      currency: expected.currency,
      gbpRate: expected.gbpRate,
    });
    const alternateCheck = checkWithSplit(alternateSplit);
    if (alternateCheck.ok) {
      return buildOut(true, 'accounted', alternateSplit);
    }

    return buildOut(false, primaryCheck.lifecycleState, primarySplit, primaryCheck.reason);
  } catch (err) {
    safeLogger.warn('[SolanaPayment] verification RPC error:', err);
    return buildOut(
      false,
      'submitted',
      primarySplit,
      err instanceof Error ? err.message : 'Solana RPC unreachable'
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Browser-Interruption Recovery Helper:
 * Queries `getSignaturesForAddress` for the invoice's deterministic `referencePubkey`.
 */
export async function findSolanaSignatureByReference(
  invoiceIdOrRef: string,
  referencePubkey?: string,
  rpcUrl: string = ACTIVE_SOLANA_CLUSTER.rpcUrl
): Promise<string | null> {
  const ref =
    referencePubkey && isValidSolanaAddress(referencePubkey)
      ? referencePubkey
      : isValidSolanaAddress(invoiceIdOrRef)
        ? invoiceIdOrRef
        : deriveInvoiceReferencePubkey(invoiceIdOrRef);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [ref, { limit: 5, commitment: 'confirmed' }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: Array<{ signature?: string; err?: unknown | null }>;
    };
    const match = (data.result ?? []).find((entry) => entry && !entry.err && isValidSolanaSignature(entry.signature));
    return match?.signature ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
