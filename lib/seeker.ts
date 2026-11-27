/**
 * Solana Seeker Hardware & Seeker Genesis Token (SGT) Verification Engine
 *
 * Determines whether a connected wallet or active session qualifies for
 * the Solana Seeker Hardware Tier:
 *  - Standard Web Mode: 0.50% (50 bps), capped at £50 max
 *  - Verified Solana Seeker Mode: 0.25% (25 bps), capped at £5 max
 */

import {
  ACTIVE_SOLANA_CLUSTER,
  SEEKER_MAX_CAP_GBP,
  SEEKER_VERIFIED_FEE_BPS,
  STANDARD_MAX_CAP_GBP,
  STANDARD_SOLANA_FEE_BPS,
  isValidSolanaAddress,
} from './solana';

export interface SeekerVerificationStatus {
  isSeekerVerified: boolean;
  method: 'seed-vault-mwa' | 'sgt-onchain' | 'seeker-user-agent' | 'standard-web';
  badgeLabel: string;
  feeBps: number;
  feePercentLabel: string;
  maxCapGbp: number;
  maxCapLabel: string;
  themeAdaptation: 'seeker-obsidian-emerald' | 'solana-ultraviolet-emerald';
}

export function getSeekerStatusSummary(
  isSeekerVerified: boolean,
  method: SeekerVerificationStatus['method'] = 'standard-web'
): SeekerVerificationStatus {
  if (isSeekerVerified) {
    return {
      isSeekerVerified: true,
      method: method === 'standard-web' ? 'sgt-onchain' : method,
      badgeLabel: '📱 Seeker Genesis Verified · 0.25% (Max £5)',
      feeBps: SEEKER_VERIFIED_FEE_BPS,
      feePercentLabel: '0.25%',
      maxCapGbp: SEEKER_MAX_CAP_GBP,
      maxCapLabel: '£5 max cap',
      themeAdaptation: 'seeker-obsidian-emerald',
    };
  }
  return {
    isSeekerVerified: false,
    method: 'standard-web',
    badgeLabel: '🌐 Standard Web Mode · 0.5% (Max £50)',
    feeBps: STANDARD_SOLANA_FEE_BPS,
    feePercentLabel: '0.5%',
    maxCapGbp: STANDARD_MAX_CAP_GBP,
    maxCapLabel: '£50 max cap',
    themeAdaptation: 'solana-ultraviolet-emerald',
  };
}

/**
 * Detect Solana Seeker device or Mobile Wallet Adapter (MWA 2.0 / Seed Vault) environment in browser
 * or from an incoming HTTP request User-Agent header.
 */
export function detectSeekerHardwareEnvironment(userAgent?: string): {
  isSeekerDevice: boolean;
  detected: boolean;
  method: SeekerVerificationStatus['method'];
  reason: string;
} {
  const ua =
    userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '');

  if (/SolanaMobile|Seeker|SeedVault|Saga|MWA/i.test(ua)) {
    return {
      isSeekerDevice: true,
      detected: true,
      method: 'seeker-user-agent',
      reason: 'Solana Seeker Mobile Hardware Detected',
    };
  }

  if (typeof window !== 'undefined') {
    const win = window as unknown as {
      solanaMobile?: unknown;
      seeker?: unknown;
      solana?: { isSeeker?: boolean; isSeedVault?: boolean; isMobileWalletAdapter?: boolean };
    };
    if (
      win.solanaMobile ||
      win.seeker ||
      win.solana?.isSeeker ||
      win.solana?.isSeedVault ||
      win.solana?.isMobileWalletAdapter
    ) {
      return {
        isSeekerDevice: true,
        detected: true,
        method: 'seed-vault-mwa',
        reason: 'Solana Seeker Seed Vault (MWA 2.0) Active',
      };
    }
  }

  return {
    isSeekerDevice: false,
    detected: false,
    method: 'standard-web',
    reason: 'Standard Solana Web Mode (0.5% · £50 Max Cap)',
  };
}

const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
/** Group address from Solana Mobile's Seeker Genesis Token docs. Every SGT mint is a member of this group. */
export const SEEKER_GENESIS_GROUP_ADDRESS = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';
const MAX_SGT_CANDIDATES = 10;

type RpcJson = { result?: Record<string, unknown> };
type Parsed = { value?: Array<{ account?: { data?: { parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string; decimals?: number } } } } } }> };
type MintParsed = { value?: { data?: { parsed?: { info?: { extensions?: Array<{ extension?: string; state?: { group?: string } }> } } } } };

async function rpcCall(rpcUrl: string, method: string, params: unknown[], signal: AbortSignal): Promise<RpcJson | null> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) return null;
  return (await res.json()) as RpcJson;
}

/**
 * Check on-chain via Solana JSON-RPC whether a wallet holds a Seeker Genesis Token (SGT).
 *
 * Each SGT is its own Token-2022 mint (one per device), so a single fixed mint cannot be matched.
 * Solana Mobile's docs say to verify by group membership: the mint carries a Token Group Member
 * extension pointing at the SGT group. This reads the wallet's non-empty single-supply Token-2022
 * accounts, then checks each mint's group. Mainnet only: the SGT group does not exist on devnet.
 * Not run against the real network in this repo's tests, only against a local stand-in.
 */
export async function checkSeekerGenesisTokenOnChain(
  walletAddress: string,
  rpcUrl: string = ACTIVE_SOLANA_CLUSTER.rpcUrl
): Promise<boolean> {
  if (!isValidSolanaAddress(walletAddress)) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const accounts = await rpcCall(
      rpcUrl,
      'getTokenAccountsByOwner',
      [walletAddress, { programId: TOKEN_2022_PROGRAM_ID }, { encoding: 'jsonParsed' }],
      controller.signal
    );
    const candidates: string[] = [];
    for (const acc of (accounts?.result as Parsed | undefined)?.value ?? []) {
      const info = acc?.account?.data?.parsed?.info;
      const amt = info?.tokenAmount;
      if (!info?.mint || !amt) continue;
      // An SGT is a 0-decimal NFT. Zero-balance accounts remain after a transfer and do not count.
      if (amt.decimals === 0 && amt.amount === '1') candidates.push(String(info.mint));
    }
    for (const mint of candidates.slice(0, MAX_SGT_CANDIDATES)) {
      const mintInfo = await rpcCall(rpcUrl, 'getAccountInfo', [mint, { encoding: 'jsonParsed' }], controller.signal);
      const extensions = (mintInfo?.result as MintParsed | undefined)?.value?.data?.parsed?.info?.extensions;
      if (!Array.isArray(extensions)) continue;
      const isMember = extensions.some(
        (e) => e?.extension === 'tokenGroupMember' && e?.state?.group === SEEKER_GENESIS_GROUP_ADDRESS
      );
      if (isMember) return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Server-side verification of Seeker eligibility (`0.25%` fee capped at `£5`):
 * Checks:
 *  1. Whether the authenticated wallet (or recipient wallet) holds a Seeker Genesis / Chapter 2 token on-chain.
 */
export async function verifySeekerEligibilityServer(opts: {
  walletAddress?: string;
  recipientAddress?: string;
  userAgent?: string | null;
  rpcUrl?: string;
  /**
   * Off by default. A User-Agent header is set by the caller, so it proves nothing on the server.
   * It is still used in the browser to preview the Seeker theme. Only set this to true in tests.
   */
  trustUserAgent?: boolean;
}): Promise<{ verified: boolean; isEligible: boolean; reason: string }> {
  if (opts.trustUserAgent) {
    const hw = detectSeekerHardwareEnvironment(opts.userAgent || '');
    if (hw.detected) {
      return { verified: true, isEligible: true, reason: hw.reason };
    }
  }

  if (opts.walletAddress && isValidSolanaAddress(opts.walletAddress)) {
    const hasSgt = await checkSeekerGenesisTokenOnChain(opts.walletAddress, opts.rpcUrl);
    if (hasSgt) {
      return {
        verified: true,
        isEligible: true,
        reason: 'Seeker Genesis / Chapter 2 Token Verified On-Chain',
      };
    }
  }

  if (
    opts.recipientAddress &&
    opts.recipientAddress !== opts.walletAddress &&
    isValidSolanaAddress(opts.recipientAddress)
  ) {
    const recipientHasSgt = await checkSeekerGenesisTokenOnChain(opts.recipientAddress, opts.rpcUrl);
    if (recipientHasSgt) {
      return {
        verified: true,
        isEligible: true,
        reason: 'Recipient Seeker Genesis / Chapter 2 Token Verified On-Chain',
      };
    }
  }

  return {
    verified: false,
    isEligible: false,
    reason: 'Standard Solana Web Mode (0.50% · £50 Max Cap)',
  };
}
