/**
 * Pure, dependency-free Solana + Seeker fee, Base58, Ed25519 signature,
 * 6-state payment lifecycle, GBP settlement, binary Solana wire transaction builder,
 * Ed25519 PDA & Associated Token Account (ATA) derivation (`CreateIdempotent`),
 * live GBP FX rate feed, and atomic transaction verification engine.
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
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta' ||
  process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta'
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

/** Official Solana Associated Token Account Program ID */
export const SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

/** Official Solana System Program ID (32 zero bytes) */
export const SOLANA_SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

/** Official Seeker Genesis Token / Chapter 2 Preorder Mint Collection authorities */
export const SEEKER_GENESIS_COLLECTION_MINTS = [
  '46pcSL5gmjBrPqGKFaLbbCmR6iVuLJbnQy13hAe7s6CC', // Solana Mobile Chapter 2 / Seeker Preorder Token
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

export interface LiveGbpFxQuote {
  USDC: number;
  EURC: number;
  source: 'ecb-frankfurter-live' | 'fallback-reference';
  fetchedAt: string;
}

let cachedFxQuote: { quote: LiveGbpFxQuote; expiresAtMs: number } | null = null;

/**
 * Fetch live GBP FX reference rates for USDC (USD->GBP) and EURC (EUR->GBP)
 * with a 15-minute memory cache and offline fallback to `DEFAULT_GBP_RATES`.
 */
export async function fetchLiveGbpRates(): Promise<LiveGbpFxQuote> {
  const now = Date.now();
  if (cachedFxQuote && cachedFxQuote.expiresAtMs > now) {
    return cachedFxQuote.quote;
  }

  // Do not perform external HTTP calls during isolated unit tests
  if (process.env.NODE_ENV === 'test' || process.env.PACTOPUS_OFFLINE_FX === '1') {
    return {
      USDC: DEFAULT_GBP_RATES.USDC,
      EURC: DEFAULT_GBP_RATES.EURC,
      source: 'fallback-reference',
      fetchedAt: new Date(now).toISOString(),
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_500);
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=GBP&to=USD,EUR', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        rates?: { USD?: number; EUR?: number };
        date?: string;
      };
      const usdPerGbp = data?.rates?.USD;
      const eurPerGbp = data?.rates?.EUR;
      if (
        typeof usdPerGbp === 'number' &&
        usdPerGbp > 0.5 &&
        usdPerGbp < 2.5 &&
        typeof eurPerGbp === 'number' &&
        eurPerGbp > 0.5 &&
        eurPerGbp < 2.5
      ) {
        const quote: LiveGbpFxQuote = {
          USDC: Number((1 / usdPerGbp).toFixed(4)),
          EURC: Number((1 / eurPerGbp).toFixed(4)),
          source: 'ecb-frankfurter-live',
          fetchedAt: new Date(now).toISOString(),
        };
        cachedFxQuote = { quote, expiresAtMs: now + 15 * 60 * 1_000 };
        return quote;
      }
    }
  } catch {
    // Fall back gracefully when offline or behind restricted firewall
  } finally {
    clearTimeout(timer);
  }

  const fallback: LiveGbpFxQuote = {
    USDC: DEFAULT_GBP_RATES.USDC,
    EURC: DEFAULT_GBP_RATES.EURC,
    source: 'fallback-reference',
    fetchedAt: new Date(now).toISOString(),
  };
  cachedFxQuote = { quote: fallback, expiresAtMs: now + 60 * 1_000 };
  return fallback;
}

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

/* ─── Ed25519 Curve Check & Solana PDA / Associated Token Account Derivation ─── */

const ED25519_P = (BigInt(1) << BigInt(255)) - BigInt(19);
const ED25519_D =
  BigInt('37095705934669439343138083508754565189542113879843219016388785533085940283555');

function modP(a: bigint): bigint {
  const r = a % ED25519_P;
  return r < BigInt(0) ? r + ED25519_P : r;
}

function modPowP(base: bigint, exp: bigint): bigint {
  let result = BigInt(1);
  let b = modP(base);
  let e = exp;
  while (e > BigInt(0)) {
    if (e & BigInt(1)) result = (result * b) % ED25519_P;
    b = (b * b) % ED25519_P;
    e >>= BigInt(1);
  }
  return result;
}

/**
 * Returns true if the 32-byte array represents a valid point on the Ed25519 curve.
 * Solana Program Derived Addresses (PDAs) MUST NOT lie on the Ed25519 curve (`isOnEd25519Curve === false`).
 */
export function isOnEd25519Curve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  let y = BigInt(0);
  for (let i = 0; i < 32; i++) {
    const b = i === 31 ? bytes[i] & 0x7f : bytes[i];
    y |= BigInt(b) << BigInt(8 * i);
  }
  if (y >= ED25519_P) return false;

  const y2 = modP(y * y);
  const u = modP(y2 - BigInt(1));
  const v = modP(ED25519_D * y2 + BigInt(1));
  if (v === BigInt(0)) return false;

  // x^2 = u / v (mod p). By Euler's criterion, x^2 is a quadratic residue mod p iff (x^2)^((p-1)/2) === 0 or 1 (mod p).
  const vInv = modPowP(v, ED25519_P - BigInt(2));
  const x2 = modP(u * vInv);
  if (x2 === BigInt(0)) {
    const signBit = (bytes[31] >> 7) & 1;
    return signBit === 0;
  }
  const legendre = modPowP(x2, (ED25519_P - BigInt(1)) / BigInt(2));
  return legendre === BigInt(1);
}

/**
 * Pure Node.js implementation of Solana's `PublicKey.findProgramAddressSync(seeds, programId)`.
 */
export function findSolanaProgramAddress(
  seeds: readonly Uint8Array[],
  programIdBase58: string
): { address: string; bump: number } {
  const programIdBytes = decodeBase58(programIdBase58);
  if (programIdBytes.length !== 32) throw new Error('Invalid programId for PDA derivation');
  const pdaMarker = Buffer.from('ProgramDerivedAddress', 'utf8');

  for (let bump = 255; bump >= 0; bump--) {
    const hash = crypto.createHash('sha256');
    for (const seed of seeds) {
      hash.update(seed);
    }
    hash.update(Buffer.from([bump]));
    hash.update(Buffer.from(programIdBytes));
    hash.update(pdaMarker);
    const candidate = new Uint8Array(hash.digest());
    if (!isOnEd25519Curve(candidate)) {
      return { address: encodeBase58(candidate), bump };
    }
  }
  throw new Error('Unable to find a valid Solana Program Derived Address off the Ed25519 curve');
}

/**
 * Deterministically derive the canonical SPL Associated Token Account (ATA) address
 * for any `(walletOwner, tokenMint)` pair using the official Solana ATA PDA seeds:
 *   `[ownerPubkey (32B), SOLANA_TOKEN_PROGRAM_ID (32B), mintPubkey (32B)]`
 * under `SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID`.
 */
export function deriveAssociatedTokenAddress(ownerBase58: string, mintBase58: string): string {
  const ownerBytes = decodeBase58(ownerBase58);
  const tokenProgramBytes = decodeBase58(SOLANA_TOKEN_PROGRAM_ID);
  const mintBytes = decodeBase58(mintBase58);
  if (ownerBytes.length !== 32 || mintBytes.length !== 32) {
    throw new Error('Owner and mint must be 32-byte Solana Base58 public keys');
  }
  return findSolanaProgramAddress(
    [ownerBytes, tokenProgramBytes, mintBytes],
    SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID
  ).address;
}

/* ─── Binary Solana Legacy Wire Transaction Serializer (Zero-Dependency) ─── */

export function encodeCompactU16(len: number): Uint8Array {
  const bytes: number[] = [];
  let rem = len & 0xffff;
  while (true) {
    let elem = rem & 0x7f;
    rem >>= 7;
    if (rem === 0) {
      bytes.push(elem);
      break;
    } else {
      elem |= 0x80;
      bytes.push(elem);
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Serialize a spec-compliant Solana Legacy Wire Transaction (base64)
 * carrying:
 *  - Automatic `CreateIdempotent` Associated Token Account (ATA) creation instructions
 *    when the recipient or treasury ATA needs to be initialized on-chain
 *  - SPL Token `TransferChecked` for the net payout (+ deterministic Reference Public Key)
 *  - SPL Token `TransferChecked` for the capped fee to Kyrvyn Treasury
 *  - SPL Memo instruction (`SPL_MEMO_PROGRAM_ID` — passing ONLY the signer `payer` in `accountIndices`,
 *    because SPL Memo v2 rejects any non-signer account passed in its instruction accounts with
 *    `ProgramError::MissingRequiredSignature`)
 */
export interface BuildSolanaWireTransactionInput {
  payer: string;
  recipient: string;
  treasury: string;
  mint: string;
  netUnits: bigint;
  feeUnits: bigint;
  memo: string;
  referencePubkey: string;
  recentBlockhash: string;
  payerTokenAccount?: string | null;
  recipientTokenAccount?: string | null;
  treasuryTokenAccount?: string | null;
  /** When true, prepends an ATA `CreateIdempotent` instruction for the recipient if their ATA is not yet initialized. */
  createRecipientAtaIfMissing?: boolean;
  /** When true, prepends an ATA `CreateIdempotent` instruction for the treasury if its ATA is not yet initialized. */
  createTreasuryAtaIfMissing?: boolean;
  decimals?: number;
}

export function buildSolanaAtomicWireTransactionBase64(
  input: BuildSolanaWireTransactionInput
): string {
  const {
    payer,
    recipient,
    treasury,
    mint,
    netUnits,
    feeUnits,
    memo,
    referencePubkey,
    recentBlockhash,
    payerTokenAccount: suppliedPayerAta,
    recipientTokenAccount: suppliedRecipientAta,
    treasuryTokenAccount: suppliedTreasuryAta,
    createRecipientAtaIfMissing = false,
    createTreasuryAtaIfMissing = false,
    decimals = 6,
  } = input;

  if (!isValidSolanaAddress(payer)) throw new Error('Invalid payer Solana address');
  if (!isValidSolanaAddress(referencePubkey)) throw new Error('Invalid reference Solana pubkey');
  if (!isValidSolanaAddress(recentBlockhash)) throw new Error('Invalid recentBlockhash');

  const hasValidMintAndParties =
    isValidSolanaAddress(mint) &&
    isValidSolanaAddress(recipient) &&
    isValidSolanaAddress(treasury);

  // Deterministically derive ATAs if not explicitly supplied so first-time recipients always receive SPL TransferChecked instructions
  const payerTokenAccount =
    suppliedPayerAta && isValidSolanaAddress(suppliedPayerAta)
      ? suppliedPayerAta
      : hasValidMintAndParties
        ? deriveAssociatedTokenAddress(payer, mint)
        : null;

  const recipientTokenAccount =
    suppliedRecipientAta && isValidSolanaAddress(suppliedRecipientAta)
      ? suppliedRecipientAta
      : hasValidMintAndParties
        ? deriveAssociatedTokenAddress(recipient, mint)
        : null;

  const treasuryTokenAccount =
    suppliedTreasuryAta && isValidSolanaAddress(suppliedTreasuryAta)
      ? suppliedTreasuryAta
      : hasValidMintAndParties
        ? deriveAssociatedTokenAddress(treasury, mint)
        : null;

  const shouldCreateRecipientAta = Boolean(
    createRecipientAtaIfMissing &&
      recipientTokenAccount &&
      !suppliedRecipientAta &&
      hasValidMintAndParties
  );

  const shouldCreateTreasuryAta = Boolean(
    createTreasuryAtaIfMissing &&
      treasuryTokenAccount &&
      !suppliedTreasuryAta &&
      feeUnits > BigInt(0) &&
      hasValidMintAndParties
  );

  // Track account metadata: { pubkey, isSigner, isWritable }
  const accountMap = new Map<string, { pubkey: string; isSigner: boolean; isWritable: boolean }>();

  const touchAccount = (pubkey: string, isSigner: boolean, isWritable: boolean) => {
    if (!isValidSolanaAddress(pubkey)) return;
    const existing = accountMap.get(pubkey);
    if (!existing) {
      accountMap.set(pubkey, { pubkey, isSigner, isWritable });
    } else {
      existing.isSigner = existing.isSigner || isSigner;
      existing.isWritable = existing.isWritable || isWritable;
    }
  };

  // Fee payer is always signer + writable
  touchAccount(payer, true, true);

  const hasSplTokenAccounts = Boolean(
    payerTokenAccount &&
      recipientTokenAccount &&
      isValidSolanaAddress(payerTokenAccount) &&
      isValidSolanaAddress(recipientTokenAccount) &&
      isValidSolanaAddress(mint)
  );

  if (shouldCreateRecipientAta || shouldCreateTreasuryAta) {
    touchAccount(SOLANA_SYSTEM_PROGRAM_ID, false, false);
    touchAccount(SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID, false, false);
  }

  if (hasSplTokenAccounts && payerTokenAccount && recipientTokenAccount) {
    touchAccount(payerTokenAccount, false, true);
    touchAccount(recipientTokenAccount, false, true);
    if (treasuryTokenAccount && isValidSolanaAddress(treasuryTokenAccount) && feeUnits > BigInt(0)) {
      touchAccount(treasuryTokenAccount, false, true);
    }
    touchAccount(mint, false, false);
    touchAccount(SOLANA_TOKEN_PROGRAM_ID, false, false);
  }

  // Always include recipient, treasury, referencePubkey, and Memo program in the message account table
  touchAccount(recipient, false, false);
  touchAccount(treasury, false, false);
  touchAccount(referencePubkey, false, false);
  touchAccount(SPL_MEMO_PROGRAM_ID, false, false);

  // Sort accounts according to Solana Message specification:
  // 1. Signer + Writable (payer first)
  // 2. Signer + Readonly
  // 3. Non-signer + Writable
  // 4. Non-signer + Readonly
  const allAccounts = Array.from(accountMap.values());
  const writableSigners = allAccounts.filter((a) => a.isSigner && a.isWritable);
  const readonlySigners = allAccounts.filter((a) => a.isSigner && !a.isWritable);
  const writableUnsigned = allAccounts.filter((a) => !a.isSigner && a.isWritable);
  const readonlyUnsigned = allAccounts.filter((a) => !a.isSigner && !a.isWritable);

  const orderedAccounts = [
    ...writableSigners,
    ...readonlySigners,
    ...writableUnsigned,
    ...readonlyUnsigned,
  ];

  const indexOfPubkey = (pk: string): number => {
    const idx = orderedAccounts.findIndex((a) => a.pubkey === pk);
    if (idx === -1) throw new Error(`Account ${pk} missing from compiled message`);
    return idx;
  };

  const compiledInstructions: Array<{
    programIdIndex: number;
    accountIndices: number[];
    data: Uint8Array;
  }> = [];

  // Helper to encode SPL Token TransferChecked (instruction discriminator = 12, u64 LE amount, u8 decimals)
  const encodeTransferCheckedData = (amount: bigint, dec: number): Uint8Array => {
    const buf = Buffer.alloc(10);
    buf.writeUInt8(12, 0); // TransferChecked
    buf.writeBigUInt64LE(amount, 1);
    buf.writeUInt8(dec, 9);
    return new Uint8Array(buf);
  };

  // Prepend Associated Token Account `CreateIdempotent` (instruction discriminator = 1)
  // when recipient or treasury ATA does not exist yet on-chain
  if (shouldCreateRecipientAta && recipientTokenAccount) {
    compiledInstructions.push({
      programIdIndex: indexOfPubkey(SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID),
      accountIndices: [
        indexOfPubkey(payer),
        indexOfPubkey(recipientTokenAccount),
        indexOfPubkey(recipient),
        indexOfPubkey(mint),
        indexOfPubkey(SOLANA_SYSTEM_PROGRAM_ID),
        indexOfPubkey(SOLANA_TOKEN_PROGRAM_ID),
      ],
      data: new Uint8Array([1]), // CreateIdempotent
    });
  }

  if (shouldCreateTreasuryAta && treasuryTokenAccount && treasuryTokenAccount !== recipientTokenAccount) {
    compiledInstructions.push({
      programIdIndex: indexOfPubkey(SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID),
      accountIndices: [
        indexOfPubkey(payer),
        indexOfPubkey(treasuryTokenAccount),
        indexOfPubkey(treasury),
        indexOfPubkey(mint),
        indexOfPubkey(SOLANA_SYSTEM_PROGRAM_ID),
        indexOfPubkey(SOLANA_TOKEN_PROGRAM_ID),
      ],
      data: new Uint8Array([1]), // CreateIdempotent
    });
  }

  if (hasSplTokenAccounts && payerTokenAccount && recipientTokenAccount) {
    // 1. Net payout SPL TransferChecked (with referencePubkey appended as readonly trailing account per @solana/pay spec)
    compiledInstructions.push({
      programIdIndex: indexOfPubkey(SOLANA_TOKEN_PROGRAM_ID),
      accountIndices: [
        indexOfPubkey(payerTokenAccount),
        indexOfPubkey(mint),
        indexOfPubkey(recipientTokenAccount),
        indexOfPubkey(payer),
        indexOfPubkey(referencePubkey),
      ],
      data: encodeTransferCheckedData(netUnits, decimals),
    });

    // 2. Capped fee SPL TransferChecked to Kyrvyn Treasury ATA
    if (treasuryTokenAccount && isValidSolanaAddress(treasuryTokenAccount) && feeUnits > BigInt(0)) {
      compiledInstructions.push({
        programIdIndex: indexOfPubkey(SOLANA_TOKEN_PROGRAM_ID),
        accountIndices: [
          indexOfPubkey(payerTokenAccount),
          indexOfPubkey(mint),
          indexOfPubkey(treasuryTokenAccount),
          indexOfPubkey(payer),
        ],
        data: encodeTransferCheckedData(feeUnits, decimals),
      });
    }
  }

  // 3. SPL Memo v2 instruction (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`)
  // IMPORTANT: SPL Memo v2 verifies that EVERY account passed in `accountIndices` is a signer
  // (`if !account_info.is_signer { return Err(ProgramError::MissingRequiredSignature); }`).
  // Therefore ONLY `payer` (the transaction signer) may be passed in `accountIndices`!
  const memoBytes = new Uint8Array(Buffer.from(memo, 'utf8'));
  compiledInstructions.push({
    programIdIndex: indexOfPubkey(SPL_MEMO_PROGRAM_ID),
    accountIndices: [indexOfPubkey(payer)],
    data: memoBytes,
  });

  // Assemble binary Message
  const numRequiredSignatures = writableSigners.length + readonlySigners.length;
  const numReadonlySignedAccounts = readonlySigners.length;
  const numReadonlyUnsignedAccounts = readonlyUnsigned.length;

  const chunks: Uint8Array[] = [];

  // Signatures array (1 empty 64-byte signature slot for payer)
  chunks.push(encodeCompactU16(numRequiredSignatures));
  for (let i = 0; i < numRequiredSignatures; i++) {
    chunks.push(new Uint8Array(64));
  }

  // Message Header (3 bytes)
  chunks.push(
    new Uint8Array([
      numRequiredSignatures,
      numReadonlySignedAccounts,
      numReadonlyUnsignedAccounts,
    ])
  );

  // Account keys
  chunks.push(encodeCompactU16(orderedAccounts.length));
  for (const acc of orderedAccounts) {
    const raw = decodeBase58(acc.pubkey);
    if (raw.length !== 32) throw new Error(`Account ${acc.pubkey} did not decode to 32 bytes`);
    chunks.push(raw);
  }

  // Recent blockhash (32 bytes)
  const blockhashBytes = decodeBase58(recentBlockhash);
  if (blockhashBytes.length !== 32) throw new Error('Recent blockhash did not decode to 32 bytes');
  chunks.push(blockhashBytes);

  // Instructions
  chunks.push(encodeCompactU16(compiledInstructions.length));
  for (const ix of compiledInstructions) {
    chunks.push(new Uint8Array([ix.programIdIndex]));
    chunks.push(encodeCompactU16(ix.accountIndices.length));
    chunks.push(new Uint8Array(ix.accountIndices));
    chunks.push(encodeCompactU16(ix.data.length));
    chunks.push(ix.data);
  }

  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const wire = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    wire.set(c, offset);
    offset += c.length;
  }

  return Buffer.from(wire).toString('base64');
}

/**
 * Fetch recent blockhash and SPL token accounts for payer/recipient/treasury from Solana JSON-RPC.
 * If recipient or treasury do not yet have an on-chain token account, flags `createRecipientAtaIfMissing` /
 * `createTreasuryAtaIfMissing` so `buildSolanaAtomicWireTransactionBase64` prepends `CreateIdempotent` for their
 * deterministically derived ATA.
 */
export async function resolveSolanaRpcContextForPayment(opts: {
  payer: string;
  recipient: string;
  treasury: string;
  mint: string;
  rpcUrl?: string;
}): Promise<{
  recentBlockhash: string;
  payerTokenAccount: string | null;
  recipientTokenAccount: string | null;
  treasuryTokenAccount: string | null;
  createRecipientAtaIfMissing: boolean;
  createTreasuryAtaIfMissing: boolean;
}> {
  const rpcUrl = opts.rpcUrl || ACTIVE_SOLANA_CLUSTER.rpcUrl;
  // Deterministic 32-byte valid Base58 fallback blockhash (all 1s = 32 zero bytes)
  const fallbackBlockhash = '11111111111111111111111111111111';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  const findOwnerTokenAccount = async (owner: string): Promise<string | null> => {
    if (!isValidSolanaAddress(owner) || !isValidSolanaAddress(opts.mint)) return null;
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [owner, { mint: opts.mint }, { encoding: 'jsonParsed' }],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        result?: { value?: Array<{ pubkey?: string }> };
      };
      const first = data?.result?.value?.[0]?.pubkey;
      return first && isValidSolanaAddress(first) ? first : null;
    } catch {
      return null;
    }
  };

  try {
    const bhPromise = fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getLatestBlockhash',
        params: [{ commitment: 'confirmed' }],
      }),
    })
      .then(async (r) => {
        if (!r.ok) return fallbackBlockhash;
        const j = (await r.json()) as {
          result?: { value?: { blockhash?: string } };
        };
        const bh = j?.result?.value?.blockhash;
        return bh && isValidSolanaAddress(bh) ? bh : fallbackBlockhash;
      })
      .catch(() => fallbackBlockhash);

    const [recentBlockhash, existingPayerAta, existingRecipientAta, existingTreasuryAta] =
      await Promise.all([
        bhPromise,
        findOwnerTokenAccount(opts.payer),
        findOwnerTokenAccount(opts.recipient),
        findOwnerTokenAccount(opts.treasury),
      ]);

    const payerTokenAccount =
      existingPayerAta ||
      (isValidSolanaAddress(opts.payer) && isValidSolanaAddress(opts.mint)
        ? deriveAssociatedTokenAddress(opts.payer, opts.mint)
        : null);

    return {
      recentBlockhash,
      payerTokenAccount,
      recipientTokenAccount: existingRecipientAta,
      treasuryTokenAccount: existingTreasuryAta,
      createRecipientAtaIfMissing: !existingRecipientAta,
      createTreasuryAtaIfMissing: !existingTreasuryAta,
    };
  } finally {
    clearTimeout(timer);
  }
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
  if (payer && !tx.signers.includes(payer)) {
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
  const effectivePayer = payer || tx.signers[0] || '';
  const payerDelta = effectivePayer
    ? getOwnerMintDelta(tx.preTokenBalances, tx.postTokenBalances, effectivePayer, expectedMint)
    : BigInt(0);

  if (effectivePayer !== recipient && recipientDelta < expectedNet) {
    return {
      ok: false,
      lifecycleState: 'discrepancy',
      reason: `Recipient net transfer short: expected ${unitsToDecimalString(expectedNet)} but observed ${unitsToDecimalString(recipientDelta < BigInt(0) ? BigInt(0) : recipientDelta)}.`,
    };
  }
  if (effectivePayer !== platform && expectedFee > BigInt(0) && platformDelta < expectedFee) {
    return {
      ok: false,
      lifecycleState: 'discrepancy',
      reason: `Platform fee transfer short: expected ${unitsToDecimalString(expectedFee)} but observed ${unitsToDecimalString(platformDelta < BigInt(0) ? BigInt(0) : platformDelta)}.`,
    };
  }
  if (
    effectivePayer &&
    effectivePayer !== recipient &&
    effectivePayer !== platform &&
    payerDelta > -(expectedNet + expectedFee)
  ) {
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
