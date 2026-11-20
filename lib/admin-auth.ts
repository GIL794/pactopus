import { timingSafeEqual, createHash } from 'node:crypto';

export type AdminAuthDecision =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

function digest(v: string): Buffer {
  return createHash('sha256').update(v, 'utf8').digest();
}

/**
 * Operator-only routes (treasury sweep, paymaster sponsorship) need a shared secret.
 * Fails closed: if AGENT_ADMIN_TOKEN is not configured the route is disabled (503);
 * otherwise `Authorization: Bearer <token>` must match in constant time.
 */
export function authorizeAdminRequest(authorizationHeader: string | null | undefined, configuredToken: string | undefined): AdminAuthDecision {
  if (!configuredToken || configuredToken.length < 24) {
    return { ok: false, status: 503, error: 'Operator endpoint disabled: AGENT_ADMIN_TOKEN (min 24 chars) is not configured.' };
  }
  const m = /^Bearer\s+(.+)$/i.exec(authorizationHeader || '');
  if (!m || !timingSafeEqual(digest(m[1].trim()), digest(configuredToken))) {
    return { ok: false, status: 401, error: 'Unauthorized.' };
  }
  return { ok: true };
}
