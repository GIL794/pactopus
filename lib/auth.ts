import { NextRequest } from 'next/server';
import { ethers } from 'ethers';
import { EvmAddressZ, safeParse } from './schemas';
import { safeLogger } from './log-redact';

/**
 * Maximum 5-minute window between signed message creation and server check.
 *
 * Rationale: if this window is too short (e.g. 10 seconds) users with
 * Metamask wallet-switch delays will fail every signature; too long
 * (e.g. 24 hours) enables replay attacks. 300 seconds matches the SIWE
 * default used by Spruce (EIP-4361).
 */
export const AUTH_NONCE_MAX_AGE_MS = 5 * 60 * 1_000;

/**
 * HTTP headers used by authenticated Pactopus API calls.
 *
 * Every write endpoint and any GET that returns owner-scoped data MUST
 * require all four headers. The `body-hash` covers the first 2 KB of the
 * POST body so replayed signatures with a modified body are rejected.
 */
export const AUTH_HEADERS = {
  WALLET: 'x-pactopus-owner',
  SIGNATURE: 'x-pactopus-signature',
  NONCE: 'x-pactopus-nonce',
  BODY_HASH: 'x-pactopus-body-hash',
  NETWORK: 'x-pactopus-network',
} as const;

export interface AuthenticatedOwnerResult {
  success: true;
  wallet: string;
}

export interface RejectedOwnerResult {
  success: false;
  error: string;
  status: number;
}

export type AuthResult = AuthenticatedOwnerResult | RejectedOwnerResult;

export function stableHash(input: string): string {
  // Deterministic checksum; signed request text binds it to the wallet signature.
  let h = 2_166_136_261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function normalizeWallet(w: string): string {
  const parsed = safeParse(EvmAddressZ, w);
  if (!parsed.success) return '';
  const wallet: string = parsed.success ? parsed.data : '';
  return wallet.toLowerCase();
}

export function buildSigningText(params: {
  wallet: string;
  nonce: string;
  method: string;
  pathname: string;
  bodyHash: string;
}): string {
  const host = 'pactopus.app';
  const issuedAt = new Date(parseInt(params.nonce, 10) || 0).toISOString();
  return (
    `Pactopus Authentication\n` +
    `\n` +
    `Host: ${host}\n` +
    `Wallet: ${params.wallet}\n` +
    `Nonce (epoch ms): ${params.nonce}\n` +
    `Issued At: ${issuedAt}\n` +
    `Request: ${params.method} ${params.pathname}\n` +
    `Body SHA: ${params.bodyHash}\n` +
    `\n` +
    `By signing this message you confirm you control ${params.wallet} and authorize this Pactopus request.`
  );
}

/**
 * Builds the four authentication headers that the browser sends with every
 * protected Pactopus call. `window.ethereum` signer uses `personal_sign`
 * which is universally supported by Metamask, Rabby, Coinbase Wallet,
 * Phantom, and WalletConnect v2.
 *
 * Called from the browser side only — the returned headers object is
 * spread into fetch() / React Query mutation headers.
 */
export async function buildSignedHeaders(opts: {
  wallet: string;
  signMessage: (msg: string) => Promise<string>;
  method: 'GET' | 'POST' | 'PUT';
  pathname: string;
  body?: unknown;
}): Promise<Record<string, string>> {
  const nonce = String(Date.now());
  const bodyString = opts.body === undefined ? '' : JSON.stringify(opts.body);
  const bodyHash = stableHash(bodyString);
  const text = buildSigningText({
    wallet: opts.wallet,
    nonce,
    method: opts.method,
    pathname: opts.pathname,
    bodyHash,
  });
  const signature = await opts.signMessage(text);
  return {
    [AUTH_HEADERS.WALLET]: opts.wallet,
    [AUTH_HEADERS.SIGNATURE]: signature,
    [AUTH_HEADERS.NONCE]: nonce,
    [AUTH_HEADERS.BODY_HASH]: bodyHash,
    [AUTH_HEADERS.NETWORK]: 'arc',
  };
}

export async function buildAlgorandSignedHeaders(opts: {
  wallet: string;
  signMessage: (message: string) => Promise<string>;
  method: 'GET' | 'POST' | 'PUT';
  pathname: string;
  body?: unknown;
}): Promise<Record<string, string>> {
  const nonce = `${Date.now()}:${crypto.randomUUID()}`;
  const bodyHash = stableHash(opts.body === undefined ? '' : JSON.stringify(opts.body));
  const text = buildSigningText({ wallet: opts.wallet, nonce, method: opts.method, pathname: opts.pathname, bodyHash });
  return {
    [AUTH_HEADERS.WALLET]: opts.wallet,
    [AUTH_HEADERS.SIGNATURE]: await opts.signMessage(text),
    [AUTH_HEADERS.NONCE]: nonce,
    [AUTH_HEADERS.BODY_HASH]: bodyHash,
    [AUTH_HEADERS.NETWORK]: 'algorand',
  };
}

/**
 * Verify an EVM `personal_sign` signature and return the authenticated
 * wallet address (lowercased). The function is a defensive three-bind
 * verifier: (wallet ↔ signature), (wallet ↔ request-scope headers), and
 * (wallet ↔ body-hash signed text) must all match.
 *
 * The authentication chain reads as follows:
 *   1. Nonce fresh (≤ 5 min). → rejects old replays.
 *   2. wallet `header is valid EVM hex (EvmAddressZ). → typo / 40 chars.
 *   3. buildSigningText() rebuilt server-side using same inputs as client.
 *   4. ethers.verifyMessage() recovers signer → === wallet header.
 *   5. body hash from header matches JSON.stringify(body) at server.
 *
 * All five steps must pass or the request is rejected as 401.
 */
export async function verifyOwnerSignature(
  request: NextRequest,
  bodyRecord: Record<string, unknown> | string | null = null
): Promise<AuthResult> {
  const walletRaw = request.headers.get(AUTH_HEADERS.WALLET);
  const signature = request.headers.get(AUTH_HEADERS.SIGNATURE);
  const nonce = request.headers.get(AUTH_HEADERS.NONCE);
  const bodyHashHeader = request.headers.get(AUTH_HEADERS.BODY_HASH);

  if (request.headers.get(AUTH_HEADERS.NETWORK) === 'algorand') return { success: false, error: 'Algorand wallet must use Algorand verification.', status: 401 };
  if (!walletRaw || !signature || !nonce) {
    return {
      success: false,
      error: `Missing auth headers: require ${AUTH_HEADERS.WALLET}, ${AUTH_HEADERS.SIGNATURE}, ${AUTH_HEADERS.NONCE}`,
      status: 401,
    };
  }

  // --- 1. Nonce freshness window ------------------------------------------------
  const nonceMs = parseInt(nonce, 10);
  if (Number.isNaN(nonceMs) || nonceMs <= 0) {
    return { success: false, error: 'Nonce must be epoch milliseconds', status: 401 };
  }
  const now = Date.now();
  if (now - nonceMs > AUTH_NONCE_MAX_AGE_MS) {
    return {
      success: false,
      error: `Authentication expired (${AUTH_NONCE_MAX_AGE_MS / 1000}s window). Refresh and sign again.`,
      status: 401,
    };
  }
  if (nonceMs > now + 5_000) {
    return { success: false, error: 'Nonce is in the future (check system clock).', status: 401 };
  }

  // --- 2. Wallet address syntactic validity ------------------------------------
  const wallet = normalizeWallet(walletRaw);
  if (!wallet) {
    return {
      success: false,
      error: `${AUTH_HEADERS.WALLET} must be a valid 0x-prefixed EVM address.`,
      status: 400,
    };
  }

  // --- 5. Body-hash double-bind (must be performed BEFORE signature because it's
  // a parameter of the signed text).
  let bodyString = '';
  if (typeof bodyRecord === 'string' && bodyRecord.length > 0) {
    bodyString = bodyRecord;
  } else if (bodyRecord !== null && typeof bodyRecord === 'object') {
    bodyString = JSON.stringify(bodyRecord);
  }
  const expectedBodyHash = stableHash(bodyString);
  if (bodyHashHeader && bodyHashHeader !== expectedBodyHash) {
    safeLogger.warn('[Auth] body-hash mismatch — signature replayed with modified body.', {
      wallet,
      url: request.nextUrl.pathname,
    });
    return { success: false, error: 'Request body tampered since signature was issued.', status: 401 };
  }

  // --- 3. Rebuild identical signing text (client ↔ server).
  const method = (request.method || 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT';
  const signingText = buildSigningText({
    wallet,
    nonce,
    method,
    pathname: request.nextUrl.pathname,
    bodyHash: expectedBodyHash,
  });

  // --- 4. EVM personal_sign recover.
  try {
    const recovered = ethers.verifyMessage(signingText, signature).toLowerCase();
    if (recovered !== wallet) {
      safeLogger.warn('[Auth] signature recovery failed — expected wallet != signer.', {
        wallet,
        recovered,
      });
      return {
        success: false,
        error: 'Signature was not produced by the declared wallet address.',
        status: 401,
      };
    }
  } catch (err) {
    safeLogger.warn('[Auth] verifyMessage threw (malformed signature):', err);
    return { success: false, error: 'Malformed authentication signature.', status: 400 };
  }

  return { success: true, wallet };
}

/**
 * Legacy-header compatibility path: unauthenticated callers (public GET /pay/[id],
 * third-party callbacks, health checks) do not have a wallet signature and are
 * allowed through with an empty owner string. The endpoint then scopes data
 * based on that empty string (e.g. `getDashboardStats` returns nothing for
 * owner=''). Only public routes should call this; protected routes call
 * `verifyOwnerSignature` which rejects on any missing header.
 */
export function extractOwnerHeaderOrEmpty(request: NextRequest): string {
  const header = request.headers.get(AUTH_HEADERS.WALLET) || request.headers.get('X-Pactopus-Owner');
  if (!header) return '';
  const parsed = safeParse(EvmAddressZ, header);
  if (!parsed.success) return '';
  const wallet: string = parsed.success ? parsed.data : '';
  return wallet.toLowerCase();
}
