/**
 * Pure, dependency-free Solana + Seeker fee, Base58, Ed25519 signature,
 * 6-state payment lifecycle, GBP settlement, and atomic transaction verification engine.
 *
 * Fee policy (Kyrvyn Ltd — Solana Seeker dApp Edition):
 *  - £0/month forever, unlimited invoices.
 *  - Standard Web Mode (anyone without Seeker verification): 0.50% (50 bps), capped at £50 equivalent ($65 USDC / €60 EURC).
 *  - Verified Solana Seeker Mode (Seeker Genesis Token / Chapter 2 Token / MWA 2.0 Seed Vault): 0.25% (25 bps), capped at £5 equivalent ($6.50 USDC / €6.00 EURC).
 */
import crypto from 'node:crypto';
import { decimalToUnits, unitsToDecimalString } from './arc-settlement';

export { decimalToUnits, unitsToDecimalString };

export type SolanaMode = 'solana' | 'seeker';
export type SolanaModeId = SolanaMode;
export type PaymentLifecycleState =
  | 'requested'
  | 'authorised'
  | 'submitted'
  | 'confirmed'
  | 'allocated'
  | 'accounted'
  | 'discrepancy'
  | 'expired';

export const PAYMENT_LIFECYCLE_STATES: readonly PaymentLifecycleState[] = [
  'requested',
  'authorised',
  'submitted',
  'confirmed',
  'allocated',
  'accounted',
] as const;

export const SOLANA_NETWORKS = {
  mainnet: {
    id: 'mainnet-beta',
    cluster: 'mainnet-beta',
    name: 'Solana Mainnet',
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    explorerUrl: 'https://solscan.io',
    tokens: {
      USDC: {
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        decimals: 6,
      },
      EURC: {
        mint: 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr',
        decimals: 6,
      },
    },
  },
  devnet: {
    id: 'devnet',
    cluster: 'devnet',
    name: 'Solana Devnet',
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com',
    explorerUrl: 'https://solscan.io',
    tokens: {
      USDC: {
        mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
        decimals: 6,
      },
      EURC: {
        mint: 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr',
        decimals: 6,
      },
    },
  },
} as const;

export const ACTIVE_SOLANA_CLUSTER =
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta'
    ? SOLANA_NETWORKS.mainnet
    : SOLANA_NETWORKS.devnet;

export const ACTIVE_SOLANA_NETWORK = ACTIVE_SOLANA_CLUSTER;

export const SOLANA_MINTS: Record<'USDC' | 'EURC', string> = {
  USDC: ACTIVE_SOLANA_CLUSTER.tokens.USDC.mint,
  EURC: ACTIVE_SOLANA_CLUSTER.tokens.EURC.mint,
};

/** Default Kyrvyn Ltd Solana Treasury Base58 public key (32-byte Ed25519 pubkey) */
export const SOLANA_PLATFORM_WALLET =
  process.env.NEXT_PUBLIC_SOLANA_PLATFORM_WALLET ||
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

export const PACTOPUS_SOLANA_TREASURY = SOLANA_PLATFORM_WALLET;

/** Official Solana Memo Program v2 ID */
export const SPL_MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const SOLANA_MEMO_PROGRAM_ID = SPL_MEMO_PROGRAM_ID;

/** Official Solana SPL Token Program ID */
export const SOLANA_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** Official Seeker Genesis Token / Chapter 2 Preorder Mint Collection authorities */
export const SEEKER_GENESIS_COLLECTION_MINTS = [
  '46pcSL5gmjBrPqGKFaLbbCmR6iVuLJbnQy13hAe7s6CC', // Solana Mobile Chapter 2 / Seeker Preorder Token
  'SeekerGenesis111111111111111111111111111111', // Seeker Genesis Token (SGT) authority
] as const;

/**
 * Fee constants:
 * - Standard Web: 0.50% (50 bps), max cap £50
 * - Seeker Verified: 0.25% (25 bps), max cap £5
 */
export const STANDARD_SOLANA_FEE_BPS = 50; // 0.50%
export const SEEKER_VERIFIED_FEE_BPS = 25; // 0.25%

export const STANDARD_MAX_CAP_GBP = 50; // £50 max cap
export const SEEKER_MAX_CAP_GBP = 5;    // £5 max cap

/** Conservative reference FX rates for GBP cap enforcement and UK HMRC accounting records */
export const DEFAULT_GBP_RATES: Record<'USDC' | 'EURC', number> = {
  USDC: 0.78, // 1 USDC ≈ £0.78  (£50 cap = 64.102564 USDC; £5 cap = 6.410256 USDC)
  EURC: 0.85, // 1 EURC ≈ £0.85  (£50 cap = 58.823529 EURC; £5 cap = 5.882353 EURC)
};

/**
 * Convert a GBP cap (£50 or £5) into 6-decimal token base units (USDC or EURC)
 * at the given GBP-per-token exchange rate.
 */
export function gbpCapToTokenUnits(
  maxCapGbp: number,
  currency: 'USDC' | 'EURC' = 'USDC',
  gbpPerToken: number = DEFAULT_GBP_RATES[currency]
): bigint {
  if (maxCapGbp <= 0 || gbpPerToken <= 0) throw new Error('Cap and rate must be positive');
  const rawUnits = Math.round((maxCapGbp / gbpPerToken) * 1_000_000);
  return BigInt(rawUnits);
}

export interface SolanaFeeSplitResult {
  total: bigint;
  fee: bigint;
  net: bigint;
  totalUnits: bigint;
  feeUnits: bigint;
  netUnits: bigint;
  totalDisplay: string;
  feeDisplay: string;
  netDisplay: string;
  uncappedFee: bigint;
  capApplied: boolean;
  isCapped: boolean;
  feeBps: number;
  maxCapGbp: number;
  maxCapTokenUnits: bigint;
  gbpRate: number;
  gbpTotalFormatted: string;
  gbpFeeFormatted: string;
  gbpNetFormatted: string;
  gbpTotalDisplay: string;
  gbpFeeDisplay: string;
  gbpNetDisplay: string;
  gbpAmount: string;
  gbpFee: string;
  gbpNetAmount: string;
}

/**
 * Compute exact 6-decimal integer fee split with the user-mandated Seeker vs Standard rules:
 *  - Non-Seeker (`isSeekerVerified = false`): 0.50% (50 bps), capped at £50
 *  - Seeker (`isSeekerVerified = true`):      0.25% (25 bps), capped at £5
 */
export function splitSolanaAmount(
  amount: string,
  opts?: {
    isSeekerVerified?: boolean;
    currency?: 'USDC' | 'EURC';
    gbpRate?: number;
  }
): SolanaFeeSplitResult {
  const isSeeker = Boolean(opts?.isSeekerVerified);
  const currency = opts?.currency ?? 'USDC';
  const gbpRate = opts?.gbpRate && opts.gbpRate > 0 ? opts.gbpRate : DEFAULT_GBP_RATES[currency];

  const total = decimalToUnits(amount, 6);
  if (total <= BigInt(0)) throw new Error('Amount must be positive');

  const feeBps = isSeeker ? SEEKER_VERIFIED_FEE_BPS : STANDARD_SOLANA_FEE_BPS;
  const maxCapGbp = isSeeker ? SEEKER_MAX_CAP_GBP : STANDARD_MAX_CAP_GBP;
  const maxCapTokenUnits = gbpCapToTokenUnits(maxCapGbp, currency, gbpRate);

  const uncappedFee = (total * BigInt(feeBps)) / BigInt(10_000);
  const capApplied = uncappedFee > maxCapTokenUnits;
  const fee = capApplied ? maxCapTokenUnits : uncappedFee;
  const net = total - fee;

  const toGbpStr = (units: bigint): string => {
    const tokens = Number(units) / 1_000_000;
    return (tokens * gbpRate).toFixed(2);
  };

  const totalDisplay = unitsToDecimalString(total);
  const feeDisplay = unitsToDecimalString(fee);
  const netDisplay = unitsToDecimalString(net);
  const gbpTotalFormatted = toGbpStr(total);
  const gbpFeeFormatted = toGbpStr(fee);
  const gbpNetFormatted = toGbpStr(net);

  return {
    total,
    fee,
    net,
    totalUnits: total,
    feeUnits: fee,
    netUnits: net,
    totalDisplay,
    feeDisplay,
    netDisplay,
    uncappedFee,
    capApplied,
    isCapped: capApplied,
    feeBps,
    maxCapGbp,
    maxCapTokenUnits,
    gbpRate,
    gbpTotalFormatted,
    gbpFeeFormatted,
    gbpNetFormatted,
    gbpTotalDisplay: gbpTotalFormatted,
    gbpFeeDisplay: gbpFeeFormatted,
    gbpNetDisplay: gbpNetFormatted,
    gbpAmount: gbpTotalFormatted,
    gbpFee: gbpFeeFormatted,
    gbpNetAmount: gbpNetFormatted,
  };
}

/* ─── Base58 Encoding / Decoding (Bitcoin/Solana alphabet) ─────────────── */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = new Map<string, number>();
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP.set(BASE58_ALPHABET[i], i);
}

export function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) {
    zeros++;
  }
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = BASE58_ALPHABET[0].repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    out += BASE58_ALPHABET[digits[i]];
  }
  return out;
}

export function decodeBase58(str: string): Uint8Array {
  if (typeof str !== 'string' || str.length === 0) {
    throw new Error('Invalid Base58 string');
  }
  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') {
    zeros++;
  }
  const b256: number[] = [];
  for (let i = zeros; i < str.length; i++) {
    const val = BASE58_MAP.get(str[i]);
    if (val === undefined) {
      throw new Error(`Invalid Base58 character: ${str[i]}`);
    }
    let carry = val;
    for (let j = 0; j < b256.length; j++) {
      carry += b256[j] * 58;
      b256[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      b256.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = new Uint8Array(zeros + b256.length);
  for (let i = 0; i < b256.length; i++) {
    out[zeros + i] = b256[b256.length - 1 - i];
  }
  return out;
}

/**
 * Validate a Solana public key (Base58 string that decodes to exactly 32 bytes).
 */
export function isValidSolanaAddress(address: unknown): address is string {
  if (typeof address !== 'string' || address.length < 32 || address.length > 44) {
    return false;
  }
  try {
    const decoded = decodeBase58(address);
    return decoded.length === 32;
  } catch {
    return false;
  }
}

/**
 * Validate a Solana transaction signature (Base58 string that decodes to 64 bytes).
 */
export function isValidSolanaSignature(sig: unknown): sig is string {
  if (typeof sig !== 'string' || sig.length < 64 || sig.length > 90) {
    return false;
  }
  try {
    const decoded = decodeBase58(sig);
    return decoded.length === 64;
  } catch {
    return false;
  }
}

/**
 * Generate a deterministic 32-byte Solana reference public key from an invoice ID
 * so Solana Pay / `getSignaturesForAddress` can locate the transaction on-chain
 * even if the payer's mobile browser closes mid-flight.
 */
export function deriveInvoiceReferencePubkey(invoiceId: string): string {
  const digest = crypto.createHash('sha256').update(`pactopus:solana:ref:${invoiceId}`, 'utf8').digest();
  return encodeBase58(new Uint8Array(digest));
}

/**
 * Build the canonical SPL Memo tag attached to every Pactopus Solana invoice payment.
 */
export function buildPactopusMemo(invoiceId: string, mode: SolanaMode = 'solana'): string {
  return `pactopus:v2:${mode}:${invoiceId}`;
}

/**
 * Verify a Solana Ed25519 message signature using Node's built-in `node:crypto`
 * (DER SubjectPublicKeyInfo ASN.1 prefix + 32-byte raw Ed25519 public key).
 * Signature can be Base64 or Base58 encoded (64 bytes).
 */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function verifySolanaEd25519Signature(
  walletBase58: string,
  messageText: string,
  signatureEncoded: string
): boolean {
  try {
    if (!isValidSolanaAddress(walletBase58)) return false;
    const pubkeyBytes = decodeBase58(walletBase58);
    if (pubkeyBytes.length !== 32) return false;

    let sigBytes: Uint8Array;
    if (/^[A-Za-z0-9+/]{86}==$/.test(signatureEncoded)) {
      sigBytes = new Uint8Array(Buffer.from(signatureEncoded, 'base64'));
    } else {
      sigBytes = decodeBase58(signatureEncoded);
    }
    if (sigBytes.length !== 64) return false;

    const spkiDer = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(pubkeyBytes)]);
    const publicKey = crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(messageText, 'utf8'), publicKey, Buffer.from(sigBytes));
  } catch {
    return false;
  }
}

/**
 * Sign a message with a Node Ed25519 private key object or 32-byte seed (for unit tests & agent scripts).
 */
export function createSolanaTestKeypair(): {
  publicKeyBase58: string;
  signMessageBase64: (msg: string) => string;
  signMessageBase58: (msg: string) => string;
} {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const rawPub = new Uint8Array(spki.subarray(spki.length - 32));
  const publicKeyBase58 = encodeBase58(rawPub);
  return {
    publicKeyBase58,
    signMessageBase64(msg: string) {
      return crypto.sign(null, Buffer.from(msg, 'utf8'), privateKey).toString('base64');
    },
    signMessageBase58(msg: string) {
      const sig = crypto.sign(null, Buffer.from(msg, 'utf8'), privateKey);
      return encodeBase58(new Uint8Array(sig));
    },
  };
}

export interface ParsedSolanaTokenBalance {
  owner: string;
  mint: string;
  amountRaw: bigint;
}

export interface ParsedSolanaTransactionLike {
  signature: string;
  err: unknown | null;
  signers: readonly string[];
  accountKeys: readonly string[];
  preTokenBalances: readonly ParsedSolanaTokenBalance[];
  postTokenBalances: readonly ParsedSolanaTokenBalance[];
  memo?: string | null;
}

export interface VerifySolanaSettlementInput {
  tx: ParsedSolanaTransactionLike | null | undefined;
  expectedMint: string;
  payer: string;
  recipient: string;
  platform: string;
  expectedNet: bigint;
  expectedFee: bigint;
  expectedMemo?: string;
  expectedReference?: string;
}

function getOwnerMintDelta(
  pre: readonly ParsedSolanaTokenBalance[],
  post: readonly ParsedSolanaTokenBalance[],
  owner: string,
  mint: string
): bigint {
  let preSum = BigInt(0);
  let postSum = BigInt(0);
  for (const b of pre) {
    if (b.owner === owner && b.mint === mint) preSum += b.amountRaw;
  }
  for (const b of post) {
    if (b.owner === owner && b.mint === mint) postSum += b.amountRaw;
  }
  return postSum - preSum;
}

export function verifySolanaAtomicSettlement(input: VerifySolanaSettlementInput): {
  ok: boolean;
  lifecycleState: PaymentLifecycleState;
  reason?: string;
} {
  const { tx, expectedMint, payer, recipient, platform, expectedNet, expectedFee, expectedMemo, expectedReference } = input;
  if (!tx) {
    return { ok: false, lifecycleState: 'submitted', reason: 'Transaction not yet confirmed on Solana cluster.' };
  }
  if (!isValidSolanaSignature(tx.signature)) {
    return { ok: false, lifecycleState: 'discrepancy', reason: 'Malformed Solana transaction signature.' };
  }
  if (tx.err !== null && tx.err !== undefined) {
    return { ok: false, lifecycleState: 'discrepancy', reason: 'Solana transaction failed on-chain.' };
  }
  if (!tx.signers.includes(payer)) {
    return { ok: false, lifecycleState: 'discrepancy', reason: 'Authenticated payer did not sign the transaction.' };
  }
  if (expectedReference && !tx.accountKeys.includes(expectedReference)) {
    return { ok: false, lifecycleState: 'discrepancy', reason: 'Invoice reference public key missing from transaction accounts.' };
  }
  if (expectedMemo && tx.memo && !tx.memo.includes(expectedMemo)) {
    return { ok: false, lifecycleState: 'discrepancy', reason: 'SPL Memo tag does not match invoice identifier.' };
  }

  const recipientDelta = getOwnerMintDelta(tx.preTokenBalances, tx.postTokenBalances, recipient, expectedMint);
  const platformDelta = getOwnerMintDelta(tx.preTokenBalances, tx.postTokenBalances, platform, expectedMint);
  const payerDelta = getOwnerMintDelta(tx.preTokenBalances, tx.postTokenBalances, payer, expectedMint);

  if (payer !== recipient && recipientDelta < expectedNet) {
    return {
      ok: false,
      lifecycleState: 'discrepancy',
      reason: `Recipient net transfer short: expected ${unitsToDecimalString(expectedNet)} but observed ${unitsToDecimalString(recipientDelta < BigInt(0) ? BigInt(0) : recipientDelta)}.`,
    };
  }
  if (expectedFee > BigInt(0) && platformDelta < expectedFee) {
    return {
      ok: false,
      lifecycleState: 'discrepancy',
      reason: `Platform fee transfer short: expected ${unitsToDecimalString(expectedFee)} but observed ${unitsToDecimalString(platformDelta < BigInt(0) ? BigInt(0) : platformDelta)}.`,
    };
  }
  if (payer !== recipient && payerDelta > -(expectedNet + expectedFee)) {
    return {
      ok: false,
      lifecycleState: 'discrepancy',
      reason: 'Payer token outflow does not cover net payout plus platform fee.',
    };
  }

  return { ok: true, lifecycleState: 'accounted' };
}

export function getSolanaTxLink(signature: string): string {
  const clusterParam = ACTIVE_SOLANA_CLUSTER.id === 'devnet' ? '?cluster=devnet' : '';
  return `${ACTIVE_SOLANA_CLUSTER.explorerUrl}/tx/${signature}${clusterParam}`;
}
