export type SubscriptionTier = 'free' | 'pro' | 'business';

export const PLATFORM_FEE_BPS = 50;
export const PLATFORM_FEE_BPS_DECIMAL = PLATFORM_FEE_BPS / 10_000;

export const TIER_FEE_BPS: Record<SubscriptionTier, number> = {
  free: 50,     // 0.5%
  pro: 40,      // 0.4%
  business: 30, // 0.3%
};

export const TIER_PRICE_USDC: Record<Exclude<SubscriptionTier, 'free'>, string> = {
  pro: '15.00',
  business: '50.00',
};

export const TIER_PRICE_GBP_DISPLAY: Record<Exclude<SubscriptionTier, 'free'>, string> = {
  pro: '£12',
  business: '£40',
};

export function getFeeBpsForTier(tier: SubscriptionTier = 'free'): number {
  return TIER_FEE_BPS[tier] ?? PLATFORM_FEE_BPS;
}

export const STRIPE_FEE_BPS = 290;
export const STRIPE_FEE_BPS_DECIMAL = STRIPE_FEE_BPS / 10_000;
export const STRIPE_FIXED_PER_INVOICE_GBP = 0.3;

export const AGENT_NANOPAYMENT_RAW_USDC_6 = BigInt('50000');
export const AGENT_NANOPAYMENT_DISPLAY_USDC = '0.05';

export const ARC_CHAIN_ID_HEX = '0x5042002';
export const ARC_CHAIN_ID_NUMBER = 5042002;

export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, number> = {
  free: 5,
  pro: 10_000,
  business: 1_000_000,
};

export function monthlyPlatformFeeFromAmountRawBps(amountDecimal: number, tier: SubscriptionTier = 'free'): number {
  const bps = getFeeBpsForTier(tier);
  return amountDecimal * (bps / 10_000);
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
