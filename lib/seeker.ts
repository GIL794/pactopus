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
  SEEKER_GENESIS_COLLECTION_MINTS,
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

/**
 * Check on-chain via Solana JSON-RPC whether a Solana wallet holds a Seeker Genesis Token (SGT)
 * or Chapter 2 Preorder Token.
 */
export async function checkSeekerGenesisTokenOnChain(
  walletAddress: string,
  rpcUrl: string = ACTIVE_SOLANA_CLUSTER.rpcUrl
): Promise<boolean> {
  if (!isValidSolanaAddress(walletAddress)) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    for (const mint of SEEKER_GENESIS_COLLECTION_MINTS) {
      if (!isValidSolanaAddress(mint)) continue;
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            walletAddress,
            { mint },
            { encoding: 'jsonParsed' },
          ],
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        result?: {
          value?: Array<{
            account?: {
              data?: {
                parsed?: {
                  info?: {
                    tokenAmount?: { uiAmount?: number; amount?: string };
                  };
                };
              };
            };
          }>;
        };
      };
      const accounts = data?.result?.value ?? [];
      const holdsToken = accounts.some((acc) => {
        const amt = acc?.account?.data?.parsed?.info?.tokenAmount;
        return (amt?.uiAmount && amt.uiAmount > 0) || (amt?.amount && BigInt(amt.amount) > BigInt(0));
      });
      if (holdsToken) return true;
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
 *  1. Whether the request User-Agent comes from a Solana Seeker / Seed Vault / MWA 2.0 device
 *  2. Or whether the authenticated wallet (or recipient wallet) holds a Seeker Genesis / Chapter 2 token on-chain.
 */
export async function verifySeekerEligibilityServer(opts: {
  walletAddress?: string;
  recipientAddress?: string;
  userAgent?: string | null;
  rpcUrl?: string;
}): Promise<{ verified: boolean; isEligible: boolean; reason: string }> {
  const hw = detectSeekerHardwareEnvironment(opts.userAgent || '');
  if (hw.detected) {
    return { verified: true, isEligible: true, reason: hw.reason };
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
