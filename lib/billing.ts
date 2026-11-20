import {
  SEEKER_MAX_CAP_GBP,
  SEEKER_VERIFIED_FEE_BPS,
  STANDARD_MAX_CAP_GBP,
  STANDARD_SOLANA_FEE_BPS,
} from './solana';

export type SubscriptionTier = 'free' | 'pro' | 'business' | 'seeker';

/**
 * Pactopus Pricing & Fee Policy (Kyrvyn Ltd — Solana Seeker dApp Edition)
 *
 * - £0/month forever, unlimited invoices on all tiers.
 * - Anyone without Seeker verification (Standard Web Mode): 0.50% (50 bps), capped at £50 max per invoice.
 * - Anyone who holds/verifies/uses Pactopus from a Solana Seeker phone: 0.25% (25 bps), capped at £5 max per invoice.
 */
export const PLATFORM_FEE_BPS = STANDARD_SOLANA_FEE_BPS; // 50 bps = 0.50%
export const PLATFORM_FEE_BPS_DECIMAL = PLATFORM_FEE_BPS / 10_000;

export const SEEKER_FEE_BPS = SEEKER_VERIFIED_FEE_BPS; // 25 bps = 0.25%
export const SEEKER_FEE_BPS_DECIMAL = SEEKER_FEE_BPS / 10_000;

export const PLATFORM_MAX_CAP_GBP = STANDARD_MAX_CAP_GBP; // £50 cap
export const SEEKER_PLATFORM_MAX_CAP_GBP = SEEKER_MAX_CAP_GBP; // £5 cap

export const TIER_FEE_BPS: Record<SubscriptionTier, number> = {
  free: 50,     // 0.50% (Standard Web — capped at £50)
  pro: 40,      // Legacy compatibility
  business: 30, // Legacy compatibility
  seeker: 25,   // 0.25% (Verified Solana Seeker — capped at £5)
};

export const TIER_MAX_CAP_GBP: Record<SubscriptionTier, number> = {
  free: STANDARD_MAX_CAP_GBP,   // £50 max cap
  pro: STANDARD_MAX_CAP_GBP,    // £50 max cap
  business: STANDARD_MAX_CAP_GBP,
  seeker: SEEKER_MAX_CAP_GBP,   // £5 max cap
};

export const TIER_PRICE_USDC: Record<'pro' | 'business', string> = {
  pro: '15.00',
  business: '50.00',
};

export const TIER_PRICE_GBP_DISPLAY: Record<'pro' | 'business', string> = {
  pro: '£12',
  business: '£40',
};

export function getFeeBpsForTier(tier: SubscriptionTier = 'free', isSeekerVerified = false): number {
  if (isSeekerVerified || tier === 'seeker') return SEEKER_VERIFIED_FEE_BPS;
  return TIER_FEE_BPS[tier] ?? PLATFORM_FEE_BPS;
}

export function getMaxCapGbpForTier(tier: SubscriptionTier = 'free', isSeekerVerified = false): number {
  if (isSeekerVerified || tier === 'seeker') return SEEKER_MAX_CAP_GBP;
  return TIER_MAX_CAP_GBP[tier] ?? STANDARD_MAX_CAP_GBP;
}

/**
 * Compute the GBP platform fee for a single invoice of `invoiceAmountGbp`,
 * respecting the £50 cap for standard users and £5 cap for Seeker holders.
 */
export function computeCappedInvoiceFeeGbp(
  invoiceAmountGbp: number,
  isSeekerVerified = false
): { feeGbp: number; uncappedFeeGbp: number; capApplied: boolean; feeBps: number; maxCapGbp: number } {
  const feeBps = isSeekerVerified ? SEEKER_VERIFIED_FEE_BPS : STANDARD_SOLANA_FEE_BPS;
  const maxCapGbp = isSeekerVerified ? SEEKER_MAX_CAP_GBP : STANDARD_MAX_CAP_GBP;
  const uncappedFeeGbp = Math.max(0, invoiceAmountGbp * (feeBps / 10_000));
  const capApplied = uncappedFeeGbp > maxCapGbp;
  const feeGbp = capApplied ? maxCapGbp : uncappedFeeGbp;
  return { feeGbp, uncappedFeeGbp, capApplied, feeBps, maxCapGbp };
}

export const STRIPE_FEE_BPS = 290;
export const STRIPE_FEE_BPS_DECIMAL = STRIPE_FEE_BPS / 10_000;
export const STRIPE_FIXED_PER_INVOICE_GBP = 0.3;

export const AGENT_NANOPAYMENT_RAW_USDC_6 = BigInt('50000');
export const AGENT_NANOPAYMENT_DISPLAY_USDC = '0.05';

export const ARC_CHAIN_ID_HEX = '0x5042002';
export const ARC_CHAIN_ID_NUMBER = 5042002;

/**
 * Unlimited invoices on pure per-transaction cut model (1,000,000/mo practical ceiling).
 */
export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, number> = {
  free: 1_000_000,
  pro: 1_000_000,
  business: 1_000_000,
  seeker: 1_000_000,
};

export function monthlyPlatformFeeFromAmountRawBps(
  amountDecimal: number,
  tier: SubscriptionTier = 'free',
  invoicesCount = 1
): number {
  const isSeeker = tier === 'seeker';
  const count = Math.max(1, invoicesCount);
  const avgInvoice = amountDecimal / count;
  const { feeGbp } = computeCappedInvoiceFeeGbp(avgInvoice, isSeeker);
  return feeGbp * count;
}

export function monthlyStripeFeeFromAmountGbp(
  amountMonthly: number,
  invoicesCount: number
): number {
  return (
    amountMonthly * STRIPE_FEE_BPS_DECIMAL +
    Math.max(1, invoicesCount) * STRIPE_FIXED_PER_INVOICE_GBP
  );
}
