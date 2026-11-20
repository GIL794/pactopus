import { NextRequest } from 'next/server';

/**
 * Lightweight in-memory token-bucket rate limiter.
 *
 * Design choices:
 *   • In-memory Map because this code runs in Vercel serverless workers —
 *     per-process enforcement is acceptable for a hackathon MVP and avoids
 *     requiring a Redis/Upstash deployment. If you ship publicly with
 *     horizontal scale the budget may bleed N× across workers (same caveat
 *     as SCALE1 paymaster budget). Swap the storage backend for Upstash
 *     when crossing that threshold.
 *   • Buckets expire after 25h to allow a 1h grace over the 24h limit;
 *     cleanup runs lazily on every 64th request to avoid a timer.
 *   • Each caller provides composite keys (e.g. wallet + ip) and the limit
 *     is tested against *every* key — any bucket over quota causes a
 *     rejection. This is how 50/wallet/day AND 100/ip/day both apply.
 */

export const RL_DAILY_WALLET_INVOICE_LIMIT = 50;
export const RL_DAILY_IP_INVOICE_LIMIT = 100;
export const RL_DAILY_WALLET_UPGRADE_LIMIT = 5;

export const RL_BUCKET_KEY_INVOICES = 'pactopus:rl:invoices';
export const RL_BUCKET_KEY_UPGRADE = 'pactopus:rl:upgrade';

interface Bucket {
  /** ISO day string YYYY-MM-DD — bucket resets on day rollover. */
  day: string;
  /** Count of consumed tokens in the current day window. */
  count: number;
  /** Epoch ms when bucket was last touched (used in lazy expiry). */
  touched: number;
}

interface RateLimitPerKey {
  key: string;
  maxPerDay: number;
}

interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
  remaining?: number;
  exceededKey?: string;
}

const store = new Map<string, Bucket>();
let reqCounter = 0;
const CLEANUP_EVERY_N = 64;
const ONE_DAY_MS = 24 * 60 * 60 * 1_000;
const BUCKET_GRACE_MS = ONE_DAY_MS + 60 * 60 * 1_000;

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function lazyCleanup(nowMs: number) {
  for (const [k, v] of store.entries()) {
    if (nowMs - v.touched > BUCKET_GRACE_MS) store.delete(k);
  }
}

function consume(key: string, maxPerDay: number): { ok: boolean; remaining: number; retrySeconds: number } {
  const day = todayKey();
  const now = Date.now();
  reqCounter++;
  if (reqCounter % CLEANUP_EVERY_N === 0) lazyCleanup(now);

  const existing = store.get(key);
  if (!existing || existing.day !== day) {
    store.set(key, { day, count: 1, touched: now });
    return { ok: true, remaining: Math.max(0, maxPerDay - 1), retrySeconds: 0 };
  }
  if (existing.count >= maxPerDay) {
    // Compute seconds until next UTC midnight rollover
    const endOfDay = new Date(`${day}T23:59:59.999Z`).getTime();
    const retry = Math.max(1, Math.ceil((endOfDay - now) / 1000));
    return { ok: false, remaining: 0, retrySeconds: retry };
  }
  existing.count += 1;
  existing.touched = now;
  return { ok: true, remaining: Math.max(0, maxPerDay - existing.count), retrySeconds: 0 };
}

/**
 * Apply the configured daily rate-limits for a list of composite keys.
 *
 * If *any* key is over its daily cap the result is `{ ok:false, retryAfterSeconds }`
 * with the worst-case retry delay so front-end 429 handlers can block the UI until
 * bucket rollover.
 */
export async function applyRateLimit(
  keys: Array<RateLimitPerKey | string>,
  defaultsPerDay = RL_DAILY_WALLET_INVOICE_LIMIT
): Promise<RateLimitResult> {
  let worstRetry = 0;
  let minRemaining = Number.POSITIVE_INFINITY;
  let exceededKey: string | undefined;

  for (const entry of keys) {
    const { key, maxPerDay }: RateLimitPerKey =
      typeof entry === 'string' ? { key: entry, maxPerDay: defaultsPerDay } : entry;
    if (!key) continue;
    const r = consume(key, maxPerDay);
    if (!r.ok) {
      if (r.retrySeconds > worstRetry) worstRetry = r.retrySeconds;
      if (!exceededKey) exceededKey = key;
    }
    if (r.remaining < minRemaining) minRemaining = r.remaining;
  }

  const ok = !exceededKey;
  return Promise.resolve({
    ok,
    retryAfterSeconds: worstRetry || 0,
    remaining: Number.isFinite(minRemaining) ? minRemaining : undefined,
    exceededKey,
  });
}

/**
 * Convenience preset helpers — these match the Sybil threat model called out
 * in the production audit:
 *   • invoice create: 50/wallet/day + 100/ip/day
 *   • subscription upgrade (circle checkout + on-chain): 5/wallet/day
 */
export function rateLimitForInvoiceCreate(request: NextRequest, wallet: string) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  return applyRateLimit([
    { key: `${RL_BUCKET_KEY_INVOICES}:wallet:${wallet}`, maxPerDay: RL_DAILY_WALLET_INVOICE_LIMIT },
    { key: `${RL_BUCKET_KEY_INVOICES}:ip:${ip}`, maxPerDay: RL_DAILY_IP_INVOICE_LIMIT },
  ]);
}

export function rateLimitForSubscriptionUpgrade(request: NextRequest, wallet: string) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  return applyRateLimit([
    { key: `${RL_BUCKET_KEY_UPGRADE}:wallet:${wallet}`, maxPerDay: RL_DAILY_WALLET_UPGRADE_LIMIT },
    { key: `${RL_BUCKET_KEY_UPGRADE}:ip:${ip}`, maxPerDay: RL_DAILY_WALLET_UPGRADE_LIMIT * 4 },
  ], RL_DAILY_WALLET_UPGRADE_LIMIT);
}
