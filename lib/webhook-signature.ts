import { createHmac, timingSafeEqual } from 'node:crypto';

/** Hex HMAC-SHA256 of the raw request body. */
export function computeHmacHex(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

/**
 * Constant-time check of an `X-Circle-Signature` style header ("sha256=<hex>" or "<hex>").
 * Returns false for a missing secret, missing header or any malformed value (fails closed).
 */
export function verifyHmacSignature(secret: string | undefined, rawBody: string, header: string | null | undefined): boolean {
  if (!secret || !header) return false;
  const provided = (header.startsWith('sha256=') ? header.slice(7) : header).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const expected = computeHmacHex(secret, rawBody);
  return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
}

export type WebhookAuthDecision =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

/**
 * Decide whether a webhook call is authentic.
 * - Secret configured: signature is ALWAYS required and must match (header absent = rejected).
 * - Secret not configured: rejected with 503 in production; allowed only outside production (local dev).
 */
export function authorizeWebhook(opts: {
  secret: string | undefined;
  header: string | null | undefined;
  rawBody: string;
  nodeEnv: string | undefined;
}): WebhookAuthDecision {
  if (!opts.secret) {
    if (opts.nodeEnv === 'production') {
      return { ok: false, status: 503, error: 'Webhook signing secret is not configured.' };
    }
    return { ok: true };
  }
  if (!verifyHmacSignature(opts.secret, opts.rawBody, opts.header)) {
    return { ok: false, status: 401, error: 'Invalid or missing webhook signature.' };
  }
  return { ok: true };
}

/** Mock approval is a local-development tool only. No environment flag enables it in production. */
export function isMockApprovalAllowed(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'production';
}
